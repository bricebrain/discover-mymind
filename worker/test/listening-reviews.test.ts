import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { call, login } from './helpers';
import { publishDictation } from './dictation.fixture';

let cookie: string;
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM listening_reviews'), env.DB.prepare('DELETE FROM dictation_attempts')]);
  cookie = await login();
});
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString();
const makeDue = (id: string) => env.DB.prepare('UPDATE listening_reviews SET due_at=? WHERE content_id=?').bind(yesterday(), id).run();

it('programme à J+1 puis avance à J+3 et J+7, sans doubler une réécoute', async () => {
  const p = await publishDictation(true);
  const submit = () => call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, unitId: 'd001', typed: 'The bank is expected' } });
  expect((await submit()).status).toBe(200);
  const row = await env.DB.prepare('SELECT * FROM listening_reviews WHERE content_id=?').bind(p.contentId).first<{ due_at: string; step: number }>();
  expect(Date.parse(row!.due_at) - Date.now()).toBeGreaterThan(86_000_000);
  await submit();
  expect((await env.DB.prepare('SELECT due_at FROM listening_reviews WHERE content_id=?').bind(p.contentId).first())!.due_at).toBe(row!.due_at);
  expect(await (await call('/api/listening-reviews/due', { cookie })).json()).toEqual({ reviews: [] });
  await makeDue(p.contentId);
  const due = await (await call('/api/listening-reviews/due', { cookie })).json<{ reviews: unknown[] }>();
  expect(due.reviews).toEqual([expect.objectContaining({ contentId: p.contentId, title: 'Rates', passage: expect.objectContaining({ startMs: 0, endMs: 4000 }) })]);
  const done = () => call(`/api/listening-reviews/${p.contentId}/done`, { method: 'POST', cookie, body: { publicationId: p.publicationId, variantKey: 'en-source' } });
  const next = await (await done()).json<{ step: number; dueAt: string }>();
  expect(next.step).toBe(2);
  expect(Date.parse(next.dueAt) - Date.now()).toBeGreaterThan(3 * 86_000_000);
  expect(await (await done()).json()).toMatchObject({ alreadyDone: true, step: 2, dueAt: next.dueAt });
  await makeDue(p.contentId);
  expect(await (await done()).json()).toMatchObject({ step: 3 });
  await makeDue(p.contentId);
  expect(await (await done()).json()).toMatchObject({ step: 3 });
});

it('utilise le dernier essai de chaque phrase, applique 90 % et revient au premier palier sinon', async () => {
  const p = await publishDictation(true);
  await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, unitId: 'd001', typed: 'The bank is expected' } });
  await env.DB.prepare('UPDATE dictation_attempts SET expected_words=10,correct_words=9 WHERE content_id=?').bind(p.contentId).run();
  const done = () => call(`/api/listening-reviews/${p.contentId}/done`, { method: 'POST', cookie, body: { publicationId: p.publicationId, variantKey: 'en-source' } });
  await makeDue(p.contentId);
  expect(await (await done()).json()).toMatchObject({ step: 2, accuracy: 0.9 });
  // Nouvel essai de la même unité : son score remplace le précédent dans le calcul.
  await env.DB.prepare(`INSERT INTO dictation_attempts SELECT 'latest',content_id,publication_id,variant_key,segment_id,voice,
    expected,typed,10,8,'[]',NULL,'2099-01-01T00:00:00.000Z' FROM dictation_attempts WHERE content_id=? LIMIT 1`).bind(p.contentId).run();
  await makeDue(p.contentId);
  expect(await (await done()).json()).toMatchObject({ step: 1, accuracy: 0.8 });
});

it('protège les routes, exporte les données et les supprime avec le contenu', async () => {
  expect((await call('/api/listening-reviews/due')).status).toBe(401);
  const p = await publishDictation(true);
  const path = `/api/listening-reviews/${p.contentId}/done`;
  expect((await call(path, { method: 'POST', cookie, body: {} })).status).toBe(400);
  expect((await call(path, { method: 'POST', cookie, body: { publicationId: p.publicationId, variantKey: 'en-source' } })).status).toBe(404);
  await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, unitId: 'd001', typed: 'The bank is expected' } });
  const exported = await (await call('/api/export?v=2&page=0', { cookie })).json<{ dictationAttempts: { content_id: string }[]; listeningReviews: { content_id: string }[] }>();
  expect(exported.dictationAttempts.some(a => a.content_id === p.contentId)).toBe(true);
  expect(exported.listeningReviews.some(a => a.content_id === p.contentId)).toBe(true);
  expect((await call(`/api/contents/${p.contentId}`, { method: 'DELETE', cookie })).status).toBe(204);
  for (const table of ['dictation_attempts', 'listening_reviews']) {
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE content_id=?`).bind(p.contentId).first()).toEqual({ n: 0 });
  }
});
