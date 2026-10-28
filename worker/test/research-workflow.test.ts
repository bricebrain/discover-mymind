/// <reference lib="esnext.disposable" />
import { env } from 'cloudflare:workers';
import { introspectWorkflowInstance } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reserve } from '../src/research/store';
import { article, searchResponse, sources } from './research-fixtures';

beforeEach(async () => {
  await env.DB.batch(['DELETE FROM research_operations', 'DELETE FROM research_drafts', 'DELETE FROM research_runs',
    "UPDATE app_settings SET value='1' WHERE key='research_enabled'", "DELETE FROM articles WHERE source_id='discover-research'"].map(s => env.DB.prepare(s)));
  await env.DB.prepare("INSERT INTO app_settings(key,value) VALUES ('research_auto_publish','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  { autoPublish: false, verdict: 'ok', state: 'draft', count: 0 },
  { autoPublish: true, verdict: 'ok', state: 'published', count: 1 },
  { autoPublish: true, verdict: 'review', state: 'draft', count: 0 },
  { autoPublish: true, verdict: 'rejected', state: 'draft', count: 0 },
])('respecte la publication automatique $autoPublish et le verdict $verdict dans le vrai Workflow', async ({ autoPublish, verdict, state, count }) => {
  await env.DB.batch([
    env.DB.prepare("UPDATE app_settings SET value=? WHERE key='research_auto_publish'").bind(autoPublish ? '1' : '0'),
    env.DB.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES ('research_publication_origin','https://discover.test')"),
  ]);
  let generated = 0;
  const calls = vi.fn<typeof fetch>(async input => {
    if (String(input).endsWith(':generateContent')) {
      generated++;
      if (generated === 1) return Response.json(searchResponse);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(generated === 2 ? article : { verdict, reasons: ['Contrôle terminé.'] }) }] } }] });
    }
    expect(sources.some(source => source.url === String(input))).toBe(true);
    return new Response('<article><p>' + 'Expérience, résultats et limites de la recherche. '.repeat(80) + '</p></article>', { headers: { 'Content-Type': 'text/html' } });
  });
  vi.stubGlobal('fetch', calls);
  const { id } = await reserve(env);
  await using inspector = await introspectWorkflowInstance(env.RESEARCH, id);
  await env.RESEARCH.create({ id, params: { id } });
  await inspector.waitForStatus('complete');
  expect(await env.DB.prepare('SELECT state FROM research_runs WHERE id=?').bind(id).first()).toEqual({ state: 'drafted' });
  expect(await env.DB.prepare('SELECT state FROM research_drafts WHERE run_id=?').bind(id).first()).toEqual({ state });
  expect(await env.DB.prepare("SELECT COUNT(*) n FROM articles WHERE source_id='discover-research'").first()).toEqual({ n: count });
  expect(generated).toBe(3);
}, 30_000);

it('une réponse perdue arrête le Workflow sans relancer le fournisseur', async () => {
  const calls = vi.fn<typeof fetch>(async () => { throw new Error('réponse perdue'); });
  vi.stubGlobal('fetch', calls);
  const { id } = await reserve(env);
  await using inspector = await introspectWorkflowInstance(env.RESEARCH, id);
  await env.RESEARCH.create({ id, params: { id } });
  await inspector.waitForStatus('errored');
  expect(calls).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare('SELECT state,reserved_micros FROM research_runs WHERE id=?').bind(id).first()).toEqual({ state: 'failed', reserved_micros: 250_000 });
}, 30_000);
