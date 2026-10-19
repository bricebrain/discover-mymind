import { env } from 'cloudflare:workers';
import { beforeEach, expect, it, vi } from 'vitest';
import { update } from '../src/routes/reflections';
import { linkStatements } from '../src/mind/links';
import { canonicalJson } from '../src/publications/validation';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

let cookie = '';
const EP = 'a2-episode';
const CONTENT = 'a2-content';
const episode = { targetType: 'episode', targetId: EP, quote: 'Citation épisode' };
const content = { targetType: 'content', targetId: CONTENT };
const passage = { ...content, variantKey: 'en-source', segmentId: 's001', quote: 'Passage cité' };
interface Note { id: string; updatedAt: string; body: string; links: Record<string, unknown>[] }
beforeEach(async () => {
  cookie = await login();
  await env.DB.prepare('DELETE FROM reflections').run();
  await env.DB.prepare(`INSERT OR IGNORE INTO episodes (id,show_id,guid,title,audio_url,created_at)
    SELECT ?,id,?,'Épisode A2','https://example.com/a.mp3','2026-10-19' FROM shows LIMIT 1`).bind(EP, EP).run();
  const path = 'segments/en-source.json';
  const raw = canonicalJson({ schemaVersion: 1, variantKey: 'en-source', segments: [{ id: 's001', text: 'Passage cité', startMs: null, endMs: null }] });
  const sha256 = await sha256Hex(raw);
  const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
  const response = await call('/atelier/publications', { method: 'POST', headers, body: { manifest: {
    schemaVersion: 1, content: { id: CONTENT, title: 'Contenu A2', originalLanguage: 'en', sourceType: 'youtube', rights: 'personal_use' },
    variants: [{ key: 'en-source', kind: 'source', language: 'en', segmentsFile: path }],
    files: { [path]: { sha256, size: new TextEncoder().encode(raw).length, contentType: 'application/json' } },
  } } });
  expect(response.status, await response.clone().text()).toBe(200);
  const { publicationId, status } = await response.json<{ publicationId: string; status: string }>();
  if (status === 'ready') return;
  await call(`/atelier/publications/${publicationId}/files/${path}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'x-content-sha256': sha256 }, body: raw });
  const committed = await call(`/atelier/publications/${publicationId}/commit`, { method: 'POST', headers });
  expect(committed.status, await committed.clone().text()).toBe(200);
});
async function create() {
  const response = await call('/api/reflections', { method: 'POST', cookie, body: { id: crypto.randomUUID(), body: 'Initial', links: [episode, content, passage] } });
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json<{ reflection: Note }>()).reflection;
}
async function get(id: string) {
  return (await (await call(`/api/reflections/${id}`, { cookie })).json<{ reflection: Note }>()).reflection;
}
const patch = (note: Note, extra: Record<string, unknown>) => call(`/api/reflections/${note.id}`, {
  method: 'PATCH', cookie, body: { baseUpdatedAt: note.updatedAt, ...extra },
});

it('crée et remplace plusieurs liens avec contenu entier, variante, passage et citations', async () => {
  const note = await create();
  expect(note.links).toHaveLength(3);
  expect(note.links).toContainEqual(expect.objectContaining({ ...passage, targetTitle: 'Contenu A2' }));
  const changed = await patch(note, { links: [episode, { ...passage, quote: 'Nouvelle citation' }, { ...content, variantKey: 'en-source' }] });
  expect(changed.status).toBe(200);
  const next = await get(note.id);
  expect(next.links).toHaveLength(3);
  expect(next.links).toContainEqual(expect.objectContaining({ quote: 'Nouvelle citation' }));
  expect((await patch(next, { links: [] })).status).toBe(200);
  expect((await get(note.id)).links).toEqual([]);
});

it('refuse toute cible invalide avant de changer la note ou ses liens', async () => {
  const note = await create();
  for (const invalid of [null, { ...episode, targetId: 'absent' }, { ...content, targetId: 'absent' },
    { ...passage, variantKey: 'absent' }, { ...passage, segmentId: 's999' },
    { ...content, segmentId: 's001' }, { ...episode, variantKey: 'en-source' }, { ...passage, quote: 42 }]) {
    const response = await patch(note, { body: 'Changement refusé', links: [episode, invalid] });
    expect([400, 422]).toContain(response.status);
    expect(await get(note.id)).toEqual(note);
  }
});

it('un conflit détecté avant écriture ne touche pas aux liens et ignore les cibles invalides du perdant', async () => {
  const note = await create();
  expect((await patch(note, { body: 'Gagnant', links: [passage] })).status).toBe(200);
  expect((await patch(note, { links: [null] })).status).toBe(409);
  expect((await get(note.id)).links).toEqual([expect.objectContaining(passage)]);
});

it('un conflit après lecture ne touche jamais aux liens, même à horodatage identique', async () => {
  const note = await create();
  const now = Date.parse(note.updatedAt) + 1000;
  const timestamp = new Date(now).toISOString();
  // Injecte une écriture concurrente juste avant le batch du PATCH perdant.
  const database = new Proxy(env.DB, { get(target, property) {
    if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
      await env.DB.batch([
        env.DB.prepare('UPDATE reflections SET body_md=?,updated_at=?,mutation_token=? WHERE id=?').bind('Gagnant', timestamp, 'winner-token', note.id),
        env.DB.prepare('DELETE FROM reflection_links WHERE reflection_id=?').bind(note.id),
        ...((await linkStatements(env, note.id, [passage], timestamp)) ?? []).slice(1),
      ]);
      return target.batch(statements);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const response = await update(new Request(`https://discover.test/api/reflections/${note.id}`, {
      method: 'PATCH', body: JSON.stringify({ baseUpdatedAt: note.updatedAt, body: 'Perdant', links: [episode] }),
    }), { ...env, DB: database }, note.id);
    expect(response.status).toBe(409);
  } finally { clock.mockRestore(); }
  const current = await get(note.id);
  expect(current.body).toBe('Gagnant');
  expect(current.links).toEqual([expect.objectContaining(passage)]);
  expect(await env.DB.prepare("SELECT body FROM search_index WHERE kind='reflection' AND ref_id=?").bind(note.id).first('body')).toBe('Gagnant');
});
