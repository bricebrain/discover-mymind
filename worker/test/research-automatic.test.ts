import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { researchRoute } from '../src/research/routes';
import { publishApprovedDrafts } from '../src/research/automatic';
import { reserve, scheduleResearch } from '../src/research/store';
import { article } from './research-fixtures';

beforeEach(async () => {
  await env.DB.batch(['DELETE FROM research_operations', 'DELETE FROM research_drafts', 'DELETE FROM research_runs',
    "DELETE FROM articles WHERE source_id='discover-research'", "DELETE FROM app_settings WHERE key IN ('research_auto_publish','research_publication_origin')",
    "UPDATE app_settings SET value='1' WHERE key='research_enabled'"].map(s => env.DB.prepare(s)));
});

const settings = (body: unknown) => researchRoute(new Request('https://discover.test/api/research/settings', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, '/api/research/settings');

async function addDraft(id: string, verdict: string, day: number, state = 'draft') {
  const now = `2026-10-${day}T09:00:00.000Z`, run = await reserve(env, new Date(now));
  await env.DB.prepare(`INSERT INTO research_drafts(id,run_id,topic_key,title,topic,article_json,review_json,state,created_at,updated_at)
    VALUES (?,?,?,?,'ai',?,?,?,?,?)`).bind(id, run.id, article.topicKey, article.title, JSON.stringify(article),
    JSON.stringify({ verdict, reasons: [] }), state, now, now).run();
}

it('publie le stock favorable à l’activation, conserve les textes bloqués et ne publie jamais deux fois', async () => {
  await addDraft('a'.repeat(20), 'ok', 20);
  await addDraft('b'.repeat(20), 'review', 21);
  await addDraft('c'.repeat(20), 'rejected', 22);
  await addDraft('d'.repeat(20), 'ok', 23, 'rejected');
  expect(await publishApprovedDrafts(env)).toEqual([]);
  const response = await settings({ autoPublish: true });
  expect(await response.json()).toMatchObject({ autoPublish: true, enabled: true, published: ['a'.repeat(20)] });
  expect(await publishApprovedDrafts(env)).toEqual([]);
  expect(await env.DB.prepare("SELECT COUNT(*) n FROM articles WHERE source_id='discover-research'").first()).toEqual({ n: 1 });
  expect(await env.DB.prepare('SELECT url FROM articles WHERE id=?').bind('a'.repeat(20)).first())
    .toEqual({ url: 'https://discover.test/?a=' + 'a'.repeat(20) });
});

it('reprend au cron une publication en attente sans lancer de nouvelle veille avant 6 h UTC', async () => {
  await settings({ autoPublish: true });
  await addDraft('a'.repeat(20), 'ok', 20);
  await scheduleResearch(env, new Date('2026-10-27T05:00:00Z'));
  expect(await env.DB.prepare('SELECT state FROM research_drafts').first()).toEqual({ state: 'published' });
  expect(await env.DB.prepare('SELECT COUNT(*) n FROM research_runs').first()).toEqual({ n: 1 });
});

it('permet de désactiver la publication automatique sans changer la veille', async () => {
  await settings({ autoPublish: true });
  await settings({ autoPublish: false });
  await addDraft('a'.repeat(20), 'ok', 20);
  expect(await publishApprovedDrafts(env)).toEqual([]);
  expect(await env.DB.prepare("SELECT value FROM app_settings WHERE key='research_enabled'").first()).toEqual({ value: '1' });
});

it.each([{}, { autoPublish: 'oui' }, { enabled: true, autoPublish: null }])('refuse des réglages invalides %j', async body => {
  await expect(settings(body)).rejects.toMatchObject({ code: 'invalid_setting' });
});
