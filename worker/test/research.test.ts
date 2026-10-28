import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { source } from '../src/queue/leases';
import type { QueueRow } from '../src/queue/store';
import { active, checkpoint, reserve } from '../src/research/store';
import { researchRoute } from '../src/research/routes';
import { isDuplicate, validateArticle, validateReview } from '../src/research/validation';
import { readEvidence, searchWeb } from '../src/research/provider';
import { cleanupCollectedItems } from '../src/retention';
import { call, login } from './helpers';
import { article, sources } from './research-fixtures';

beforeEach(async () => {
  await env.DB.batch(['DELETE FROM research_operations', 'DELETE FROM research_drafts', 'DELETE FROM research_runs',
    "DELETE FROM articles WHERE source_id='discover-research'", "UPDATE app_settings SET value='1' WHERE key='research_enabled'"].map(s => env.DB.prepare(s)));
});

describe('veille automatique', () => {
  it('réserve une seule fois le même jour, même avec deux déclenchements concurrents', async () => {
    const now = new Date('2026-10-27T08:00:00Z');
    const runs = await Promise.all([reserve(env, now), reserve(env, now)]);
    expect(runs[0]!.id).toBe(runs[1]!.id);
    expect(await env.DB.prepare('SELECT COUNT(*) n,SUM(reserved_micros) micros FROM research_runs').first()).toMatchObject({ n: 1, micros: 250_000 });
  });
  it('limite les créneaux de rédaction à trois sur sept jours et alterne les thèmes', async () => {
    for (let day = 20; day <= 25; day++) await reserve(env, new Date(`2026-10-${day}T08:00:00Z`));
    const rows = await env.DB.prepare('SELECT topic,draft_slot FROM research_runs ORDER BY day').all<{ topic: string; draft_slot: number }>();
    expect(rows.results.reduce((sum, r) => sum + r.draft_slot, 0)).toBe(3);
    expect(new Set(rows.results.slice(0, 5).map(r => r.topic)).size).toBe(5);
  });
  it('refuse la génération désactivée ou hors enveloppe sans réserver un appel', async () => {
    const { id } = await reserve(env, new Date('2026-10-01T08:00:00Z'));
    await env.DB.prepare('UPDATE research_runs SET reserved_micros=10000000 WHERE id=?').bind(id).run();
    await expect(reserve(env, new Date('2026-10-02T08:00:00Z'))).rejects.toMatchObject({ code: 'research_limit' });
    await env.DB.prepare("UPDATE app_settings SET value='0' WHERE key='research_enabled'").run();
    await expect(active(env, id)).rejects.toThrow('désactivée');
    await expect(reserve(env)).rejects.toMatchObject({ code: 'research_disabled' });
  });
  it('ne renvoie jamais un appel dont la réponse payante a été perdue', async () => {
    const { id } = await reserve(env);
    const compute = vi.fn(async () => { throw new Error('perdu'); });
    await expect(checkpoint(env, id, 'ambiguous', compute)).rejects.toThrow('perdu');
    await expect(checkpoint(env, id, 'ambiguous', compute)).rejects.toThrow('reprise payante interdite');
    expect(compute).toHaveBeenCalledTimes(1);
  });
  it('réutilise un résultat durable sans nouvel appel', async () => {
    const { id } = await reserve(env), compute = vi.fn(async () => ({ ok: true }));
    await checkpoint(env, id, 'stored', compute);
    expect(await checkpoint(env, id, 'stored', compute)).toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('fiabilité documentaire', () => {
  it('refuse une réponse sans recherche Web effective', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Un récit inventé.' }] } }] }));
    await expect(searchWeb(env, 'recherche', {}, fetcher)).rejects.toThrow('pas été effectuée');
  });
  it('ne fait pas de rédaction si Gemini ne trouve aucun sujet', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'AUCUN_SUJET' }] } }] }));
    expect(await searchWeb(env, 'recherche', {}, fetcher)).toBeNull();
  });
  it('lit les références réelles et refuse les redirections internes', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('<article><p>' + 'Document scientifique public. '.repeat(80) + '</p></article>', { headers: { 'Content-Type': 'text/html' } }));
    const result = await readEvidence({ report: 'résultats', links: sources, searchHtml: '' }, fetcher);
    expect(result).toHaveLength(3);
    expect(result[0]!.text).toContain('Document scientifique public');
    const unsafe = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }));
    await expect(readEvidence({ report: 'x', links: sources, searchHtml: '' }, unsafe)).rejects.toThrow('Documentation insuffisante');
    expect(unsafe).toHaveBeenCalledTimes(3);
  });
  it('exige des citations existantes, trois sources et un article substantiel', () => {
    expect(validateArticle(article, sources)?.title).toBe(article.title);
    expect(() => validateArticle({ ...article, sections: article.sections.map(s => ({ ...s, sourceIds: ['inventée'] })) }, sources)).toThrow('provenance');
    expect(() => validateArticle({ ...article, sections: article.sections.map(s => ({ ...s, sourceIds: ['s1'] })) }, sources)).toThrow('Trois documents');
    expect(() => validateReview({ verdict: 'ok', reasons: ['<script>fake</script>'] })).toThrow('invalide');
    expect(isDuplicate(article, [{ title: 'Autre titre', topicKey: article.topicKey }])).toBe(true);
  });
});

describe('publication après validation', () => {
  async function draft(verdict = 'ok') {
    const { id } = await reserve(env), draftId = 'a'.repeat(20), now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO research_drafts(id,run_id,topic_key,title,topic,article_json,review_json,created_at,updated_at)
      VALUES (?,?,?,?,'ai',?,?,?,?)`).bind(draftId, id, article.topicKey, article.title, JSON.stringify(article), JSON.stringify({ verdict, reasons: [] }), now, now).run();
    return draftId;
  }
  const publish = (id: string) => researchRoute(new Request(`https://discover.test/api/research/drafts/${id}/publish`, { method: 'POST' }), env, `/api/research/drafts/${id}/publish`);
  it('garde le brouillon hors du fil, puis publie une seule fois et conserve les sources', async () => {
    const id = await draft();
    expect(await env.DB.prepare('SELECT id FROM articles WHERE id=?').bind(id).first()).toBeNull();
    await Promise.all([publish(id), publish(id)]);
    expect(await env.DB.prepare('SELECT COUNT(*) n FROM articles WHERE id=?').bind(id).first()).toEqual({ n: 1 });
    const linked = await env.DB.prepare('SELECT reflection_id FROM articles WHERE id=?').bind(id).first<{reflection_id:string}>();
    const queued = await env.DB.prepare("SELECT * FROM prepare_queue WHERE kind='reflection' AND ref=?").bind(linked!.reflection_id).all<QueueRow>();
    expect(queued.results).toHaveLength(1);
    expect(JSON.parse(queued.results[0]!.options_json)).toMatchObject({coverage:'guided',level:'B1'});
    const input = await source(env,queued.results[0]!);
    expect(input).toMatchObject({ttsProvider:'kokoro',language:'fr',articleId:id});
    expect((input as {text:string}).text).not.toContain(article.sources[0]!.url);
    const cookie = await login();
    const response = await call(`/api/articles/${id}`, { cookie });
    expect(await response.json()).toMatchObject({ article: { research: { title: article.title, sources: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] } } });
    const detail = await (await call(`/api/articles/${id}`, { cookie })).json<{ article: { research: { sources: Record<string, unknown>[] } } }>();
    expect(detail.article.research.sources.every(s => !('text' in s))).toBe(true);
    await cleanupCollectedItems(env, Date.now() + 10 * 86_400_000);
    expect(await env.DB.prepare('SELECT id FROM articles WHERE id=?').bind(id).first()).not.toBeNull();
  });
  it.each(['review', 'rejected'])('bloque une publication avec verdict %s', async verdict => {
    await expect(publish(await draft(verdict))).rejects.toMatchObject({ code: 'review_required' });
    expect(await env.DB.prepare("SELECT COUNT(*) n FROM articles WHERE source_id='discover-research'").first()).toEqual({ n: 0 });
  });
  it('protège la veille par la session et les contrôles CSRF existants', async () => {
    expect((await call('/api/research/status')).status).toBe(401);
    const cookie = await login();
    expect((await call('/api/research/settings', { method: 'PUT', cookie, body: { enabled: true }, pwa: false })).status).toBe(403);
    expect((await call('/api/research/status', { cookie })).status).toBe(200);
  });
});
