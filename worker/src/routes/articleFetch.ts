import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { validId } from './reflections';

const MAX_TEXT = 100_000;
/** Une demande restée sans réponse (Atelier éteint) peut être relancée après ce délai. */
const RETRY_AFTER_MS = 10 * 60_000;

/**
 * POST /api/reflections/:id/fetch — demande à l'Atelier de récupérer le texte de l'article.
 * Seulement pour une note Article avec un lien et sans texte : jamais d'écrasement de ce que l'utilisateur a écrit.
 */
export async function request(env: Env, rawId: string): Promise<Response> {
  const id = validId(rawId);
  const note = await env.DB.prepare('SELECT origin, source_url, body_md, article_fetch, article_fetch_at FROM reflections WHERE id=? AND deleted_at IS NULL')
    .bind(id).first<{ origin: string; source_url: string | null; body_md: string; article_fetch: string | null; article_fetch_at: string | null }>();
  if (!note) throw new HttpError(404, 'not_found', 'Note introuvable.');
  if (note.origin !== 'article' || !note.source_url) throw new HttpError(422, 'not_an_article', 'Seule une note Article avec un lien peut être récupérée.');
  if (note.body_md.trim()) throw new HttpError(409, 'body_not_empty', 'La note contient déjà du texte.');
  const recent = note.article_fetch === 'pending' && note.article_fetch_at && Date.now() - Date.parse(note.article_fetch_at) < RETRY_AFTER_MS;
  if (!recent) {
    await env.DB.prepare("UPDATE reflections SET article_fetch='pending', article_fetch_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
  }
  return json({ articleFetch: 'pending' }, 202);
}

/** GET /atelier/article-fetches — demandes en attente pour l'Atelier (5 au plus). */
export async function pending(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT id, title, source_url AS url, source_name AS sourceName FROM reflections
    WHERE article_fetch='pending' AND deleted_at IS NULL AND source_url IS NOT NULL ORDER BY article_fetch_at LIMIT 5`).all();
  return json({ items: results });
}

/**
 * POST /atelier/article-fetches/:id — résultat de l'Atelier. Le texte n'est écrit que si la note est toujours vide :
 * si l'utilisateur a écrit entre-temps, son texte est gardé (état « skipped »).
 */
export async function complete(req: Request, env: Env, rawId: string): Promise<Response> {
  const id = validId(rawId);
  const b = await readJson<Record<string, unknown>>(req, MAX_TEXT * 4 + 4096);
  const status = b.status;
  if (status !== 'complete' && status !== 'partial' && status !== 'unavailable') throw new HttpError(422, 'invalid_status', 'État : complete, partial ou unavailable.');
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > MAX_TEXT || (status !== 'unavailable' && !text)) throw new HttpError(422, 'invalid_text', 'Texte de l’article invalide.');
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
  const now = new Date().toISOString();
  if (status === 'unavailable') {
    await env.DB.prepare("UPDATE reflections SET article_fetch='unavailable', article_fetch_at=? WHERE id=? AND article_fetch='pending'").bind(now, id).run();
    return json({ articleFetch: 'unavailable' });
  }
  const r = await env.DB.prepare(`UPDATE reflections SET body_md=?, title=COALESCE(NULLIF(trim(title),''), ?), article_fetch=?, article_fetch_at=?, updated_at=?
    WHERE id=? AND article_fetch='pending' AND trim(body_md)='' AND deleted_at IS NULL`).bind(text, title || null, status, now, now, id).run();
  if (!r.meta.changes) {
    await env.DB.prepare("UPDATE reflections SET article_fetch='skipped', article_fetch_at=? WHERE id=? AND article_fetch='pending'").bind(now, id).run();
    return json({ articleFetch: 'skipped' });
  }
  return json({ articleFetch: status });
}
