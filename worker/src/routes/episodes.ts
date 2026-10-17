import type { Env } from '../env';
import { apiError, HttpError, json, readJson } from '../http';
import { CATEGORIES } from './shows';

const EPISODE_COLUMNS = `e.id, e.title, e.description, e.published_at AS publishedAt, e.duration_sec AS durationSec,
  e.audio_url AS audioUrl, COALESCE(e.image_url, s.image_url) AS imageUrl, e.transcript_type AS transcriptType,
  e.state, e.content_id AS contentId, s.id AS showId, s.title AS showTitle, s.language, s.category`;

const PAGE_SIZE = 30;
const STATES = ['new', 'seen', 'saved', 'dismissed'] as const;

function encodeCursor(sortKey: string, id: string): string {
  return btoa(`${sortKey}|${id}`).replace(/=+$/, '');
}

function decodeCursor(cursor: string): { sortKey: string; id: string } {
  try {
    const [sortKey, id] = atob(cursor).split('|');
    if (sortKey && id && /^[0-9a-f]{20}$/.test(id)) return { sortKey, id };
  } catch {
    /* curseur invalide */
  }
  throw new HttpError(400, 'invalid_cursor', 'Curseur invalide.');
}

/**
 * GET /api/explorer?category=&show=&lang=&state=&cursor=
 * Épisodes du plus récent au plus ancien. Par défaut, les épisodes écartés sont masqués.
 */
export async function explorer(req: Request, env: Env): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const where: string[] = ['s.enabled = 1 OR e.state = \'saved\''];
  const values: unknown[] = [];

  const category = p.get('category');
  if (category) {
    if (!(CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, 'invalid_query', 'Catégorie inconnue.');
    where.push('s.category = ?');
    values.push(category);
  }
  const show = p.get('show');
  if (show) {
    where.push('s.id = ?');
    values.push(show);
  }
  const lang = p.get('lang');
  if (lang) {
    if (lang !== 'fr' && lang !== 'en') throw new HttpError(400, 'invalid_query', 'Langue inconnue.');
    where.push('s.language = ?');
    values.push(lang);
  }
  const state = p.get('state');
  if (state) {
    if (!(STATES as readonly string[]).includes(state)) throw new HttpError(400, 'invalid_query', 'État inconnu.');
    where.push('e.state = ?');
    values.push(state);
  } else {
    where.push("e.state <> 'dismissed'");
  }
  const cursor = p.get('cursor');
  if (cursor) {
    const c = decodeCursor(cursor);
    where.push('(COALESCE(e.published_at, e.created_at) < ? OR (COALESCE(e.published_at, e.created_at) = ? AND e.id < ?))');
    values.push(c.sortKey, c.sortKey, c.id);
  }

  const { results } = await env.DB.prepare(
    `SELECT ${EPISODE_COLUMNS}, COALESCE(e.published_at, e.created_at) AS sortKey
       FROM episodes e JOIN shows s ON s.id = e.show_id
      WHERE ${where.map((w) => `(${w})`).join(' AND ')}
      ORDER BY sortKey DESC, e.id DESC LIMIT ?`,
  ).bind(...values, PAGE_SIZE + 1).all<Record<string, unknown> & { sortKey: string; id: string }>();

  const page = results.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return json({
    episodes: page.map(({ sortKey: _s, ...e }) => e),
    nextCursor: results.length > PAGE_SIZE && last ? encodeCursor(last.sortKey, last.id) : null,
  });
}

/** GET /api/episodes/:id */
export async function detail(env: Env, id: string): Promise<Response> {
  const e = await env.DB.prepare(`SELECT ${EPISODE_COLUMNS} FROM episodes e JOIN shows s ON s.id = e.show_id WHERE e.id = ?`)
    .bind(id).first();
  return e ? json({ episode: e }) : apiError(404, 'not_found', 'Épisode inconnu.');
}

/** POST /api/episodes/:id/state — { state: seen | saved | dismissed | new } */
export async function setState(req: Request, env: Env, id: string): Promise<Response> {
  const { state } = await readJson<{ state?: unknown }>(req, 256);
  if (typeof state !== 'string' || !(STATES as readonly string[]).includes(state)) {
    throw new HttpError(400, 'invalid_body', 'État attendu : new, seen, saved ou dismissed.');
  }
  const r = await env.DB.prepare('UPDATE episodes SET state = ? WHERE id = ?').bind(state, id).run();
  return r.meta.changes ? json({ id, state }) : apiError(404, 'not_found', 'Épisode inconnu.');
}
