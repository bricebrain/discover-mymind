import { articleStatement } from '../weekly/activity';
import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { prepareOptions } from '../queue/options';
import { insertQueue } from '../routes/queue';
import { publishedResearch } from '../research/publish';

const LIST = `SELECT a.id, a.title, a.summary, a.author, a.url, a.published_at AS publishedAt, a.content_status AS contentStatus,
  a.reflection_id AS reflectionId, length(a.content_text) AS contentLength, s.id AS sourceId, s.publisher, s.language,
  r.english_content_id AS contentId
  FROM articles a JOIN article_sources s ON s.id=a.source_id LEFT JOIN reflections r ON r.id=a.reflection_id AND r.deleted_at IS NULL`;
const ID = /^[0-9a-f]{20}$/;
const article = async (env: Env, id: string) => {
  if (!ID.test(id)) throw new HttpError(400, 'invalid_id', 'Identifiant d’article invalide.');
  const row = await env.DB.prepare(`${LIST.replace('length(a.content_text) AS contentLength', 'a.content_text AS contentText')} WHERE a.id=?`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, 'not_found', 'Article introuvable.');
  return row;
};

/** GET /api/articles?source=&lang=&cursor= — les plus récents d'abord, 30 par page. */
export async function list(req: Request, env: Env): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const where: string[] = ['s.enabled=1'], values: unknown[] = [];
  const source = p.get('source'), lang = p.get('lang'), cursor = p.get('cursor');
  if (source) { where.push('s.id=?'); values.push(source); }
  if (lang === 'fr' || lang === 'en') { where.push('s.language=?'); values.push(lang); }
  if (cursor) {
    const [at, id] = atob(cursor).split('|');
    if (!at || !id) throw new HttpError(400, 'invalid_cursor', 'Curseur invalide.');
    where.push('(a.published_at<? OR (a.published_at=? AND a.id<?))'); values.push(at, at, id);
  }
  const { results } = await env.DB.prepare(`${LIST} WHERE ${where.join(' AND ')} ORDER BY a.published_at DESC, a.id DESC LIMIT 31`).bind(...values).all<Record<string, unknown>>();
  const page = results.slice(0, 30), last = page[page.length - 1];
  const sources = await env.DB.prepare('SELECT id, title, publisher, language FROM article_sources WHERE enabled=1 ORDER BY title').all();
  return json({ articles: page, nextCursor: results.length > 30 && last ? btoa(`${last.publishedAt}|${last.id}`) : null, sources: sources.results });
}

export async function detail(env: Env, id: string) {
  const data = await article(env, id);
  await articleStatement(env, id, 'read').run();
  return json({ article: { ...data, research: data.sourceId === 'discover-research' ? await publishedResearch(env, id) : null } });
}

/** POST /api/articles/:id/fetch — texte complet demandé à l'Atelier (The Guardian ne le met pas dans son flux). */
export async function requestFetch(env: Env, id: string): Promise<Response> {
  const a = await article(env, id);
  if (a.contentText) return json({ contentStatus: a.contentStatus });
  await env.DB.prepare("UPDATE articles SET content_status='pending' WHERE id=? AND (content_text IS NULL OR content_text='')").bind(id).run();
  return json({ contentStatus: 'pending' }, 202);
}

/**
 * POST /api/articles/:id/note { prepare?: options } — l'article devient une note My Mind « Article » (journal, lien,
 * texte) ; avec `prepare`, sa version anglaise est mise en file comme toute note.
 */
export async function toNote(req: Request, env: Env, id: string): Promise<Response> {
  const a = await article(env, id);
  const b = await readJson<{ prepare?: unknown }>(req, 4096);
  let noteId = a.reflectionId as string | null;
  const exists = noteId ? await env.DB.prepare('SELECT id FROM reflections WHERE id=? AND deleted_at IS NULL').bind(noteId).first() : null;
  if (!exists) {
    const text = String(a.contentText || a.summary || '').trim();
    if (text.length < 20) throw new HttpError(422, 'no_text', 'Le texte de l’article n’est pas encore disponible.');
    noteId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO reflections (id,title,body_md,kind,tags_json,origin,source_name,source_url,created_at,updated_at)
        VALUES (?,?,?,'observation','[]','article',?,?,?,?)`).bind(noteId, String(a.title).slice(0, 200), text.slice(0, 100_000), String(a.publisher).slice(0, 120), a.url, now, now),
      env.DB.prepare('UPDATE articles SET reflection_id=? WHERE id=?').bind(noteId, id),
    ]);
  }
  await articleStatement(env, id, 'saved').run();
  if (b.prepare === undefined) return json({ noteId }, 201);
  const options = prepareOptions(b.prepare, String(a.language), null);
  const queued = await insertQueue(env, 'reflection', noteId!, options);
  const item = await queued.json<{ item: unknown }>();
  return json({ noteId, ...item }, 201);
}

/** Atelier : articles dont le texte est demandé, puis résultat (écrit seulement si toujours sans texte). */
export async function pendingTexts(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id, url, title FROM articles WHERE content_status='pending' ORDER BY created_at LIMIT 5").all();
  return json({ items: results });
}
export async function completeText(req: Request, env: Env, id: string): Promise<Response> {
  if (!ID.test(id)) throw new HttpError(400, 'invalid_id', 'Identifiant d’article invalide.');
  const b = await readJson<Record<string, unknown>>(req, 420_000);
  const status = b.status;
  if (status !== 'complete' && status !== 'partial' && status !== 'unavailable') throw new HttpError(422, 'invalid_status', 'État : complete, partial ou unavailable.');
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 100_000) : '';
  if (status !== 'unavailable' && !text) throw new HttpError(422, 'invalid_text', 'Texte de l’article invalide.');
  await env.DB.prepare(`UPDATE articles SET content_status=?, content_text=CASE WHEN ?='' THEN content_text ELSE ? END
    WHERE id=? AND content_status='pending'`).bind(status, text, text, id).run();
  return json({ contentStatus: status });
}
