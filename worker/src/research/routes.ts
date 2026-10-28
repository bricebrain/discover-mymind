import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { dispatchResearch, researchEnabled, reserve } from './store';
import { publishDraft } from './publish';
import { autoPublishEnabled, publishApprovedDrafts } from './automatic';
import { MONTHLY_MICROS, RESERVE_MICROS, TOPICS, WEEKLY_DRAFTS, type DraftRow, type ResearchArticle, type Review } from './types';

export async function researchRoute(req: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/research/status' && req.method === 'GET') {
    const month = new Date().toISOString().slice(0, 7);
    const used = await env.DB.prepare('SELECT COALESCE(SUM(reserved_micros),0) AS micros FROM research_runs WHERE substr(day,1,7)=?')
      .bind(month).first<{ micros: number }>();
    const runs = await env.DB.prepare('SELECT id,day,topic,state,error,draft_slot AS draftSlot FROM research_runs ORDER BY day DESC LIMIT 10').all();
    return json({ enabled: await researchEnabled(env), autoPublish: await autoPublishEnabled(env), configured: !!env.GEMINI_API_KEY, topics: TOPICS,
      weeklyDrafts: WEEKLY_DRAFTS, reservedMicros: used!.micros, limitMicros: MONTHLY_MICROS, reservePerRunMicros: RESERVE_MICROS, runs: runs.results });
  }
  if (path === '/api/research/settings' && req.method === 'PUT') {
    const body = await readJson<{ enabled?: unknown; autoPublish?: unknown }>(req, 1024);
    if (!body || body.enabled === undefined && body.autoPublish === undefined ||
        body.enabled !== undefined && typeof body.enabled !== 'boolean' ||
        body.autoPublish !== undefined && typeof body.autoPublish !== 'boolean') {
      throw new HttpError(422, 'invalid_setting', 'Réglage de veille ou de publication attendu.');
    }
    if ((body.enabled || body.autoPublish) && !env.GEMINI_API_KEY) throw new HttpError(409, 'research_unconfigured', 'La clé Gemini doit être configurée sur le serveur.');
    const statements = [];
    for (const [key, value] of [['research_enabled', body.enabled], ['research_auto_publish', body.autoPublish]] as const) {
      if (value !== undefined) statements.push(env.DB.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .bind(key, value ? '1' : '0'));
    }
    if (body.autoPublish === true) statements.push(env.DB.prepare("INSERT INTO app_settings(key,value) VALUES ('research_publication_origin',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(new URL(req.url).origin));
    await env.DB.batch(statements);
    const published = await publishApprovedDrafts(env);
    return json({ enabled: await researchEnabled(env), autoPublish: await autoPublishEnabled(env), published });
  }
  if (path === '/api/research/run' && req.method === 'POST') {
    const run = await reserve(env);
    if (run.state === 'reserved') await dispatchResearch(env, run.id);
    return json(run, 202);
  }
  if (path === '/api/research/drafts' && req.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT id,title,topic,state,review_json,created_at AS createdAt
      FROM research_drafts ORDER BY created_at DESC LIMIT 30`).all<{ review_json: string } & Record<string, unknown>>();
    return json({ drafts: rows.results.map(({ review_json, ...draft }) => ({ ...draft, review: JSON.parse(review_json) as Review })) });
  }
  const match = path.match(/^\/api\/research\/drafts\/([0-9a-f]{20})(?:\/(publish|reject))?$/);
  if (match?.[1]) {
    const id = match[1];
    if (req.method === 'GET' && !match[2]) {
      const row = await env.DB.prepare('SELECT * FROM research_drafts WHERE id=?').bind(id).first<DraftRow>();
      if (!row) throw new HttpError(404, 'not_found', 'Brouillon introuvable.');
      const article = JSON.parse(row.article_json) as ResearchArticle;
      return json({ draft: { id, title: row.title, topic: row.topic, state: row.state, createdAt: row.created_at,
        review: JSON.parse(row.review_json) as Review, article: { ...article, sources: article.sources.map(({ text: _text, ...source }) => source) } } });
    }
    if (req.method === 'POST' && match[2] === 'publish') return publishDraft(env, id, new URL(req.url).origin);
    if (req.method === 'POST' && match[2] === 'reject') {
      const updated = await env.DB.prepare("UPDATE research_drafts SET state='rejected',updated_at=? WHERE id=? AND state='draft'")
        .bind(new Date().toISOString(), id).run();
      if (!updated.meta.changes) throw new HttpError(409, 'draft_changed', 'Ce brouillon est déjà traité ou introuvable.');
      return json({ id, state: 'rejected' });
    }
  }
  throw new HttpError(404, 'not_found', 'Route de recherche inconnue.');
}
