import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { LEVELS, levelSuggestion, type Level, type Rating } from './suggestion';

interface Target { showId: string; publicationId: string; level: Level }

async function feedbackTarget(env: Env, id: string, key: string, publicationId: string): Promise<Target> {
  const row = await env.DB.prepare(`SELECT e.show_id AS showId, p.id AS publicationId,
      v.language, v.kind, v.cefr_level AS cefrLevel
    FROM contents c JOIN publications p ON p.content_id=c.id
    JOIN variants v ON v.publication_id=p.id
    JOIN episodes e ON (c.source_type='podcast' AND c.source_ref='episode:' || e.id)
      OR (c.source_type='youtube' AND c.source_ref='youtube:' || e.video_id)
    WHERE c.id=? AND c.deleted_at IS NULL AND p.id=? AND v.variant_key=?
      AND ((p.id=c.current_publication_id AND p.status='ready')
        OR (p.status='superseded' AND p.superseded_at>?))`)
    .bind(id, publicationId, key, new Date(Date.now() - 7 * 86400_000).toISOString())
    .first<{ showId: string; publicationId: string; language: string; kind: string; cefrLevel: string | null }>();
  if (!row) throw new HttpError(404, 'not_found', 'Version ou émission indisponible.');
  const level = row.kind === 'source' ? 'original'
    : row.kind === 'adaptation' ? row.cefrLevel : row.cefrLevel ?? 'original';
  if (row.language !== 'en' || !LEVELS.includes(level as Level)) {
    throw new HttpError(422, 'unsupported_level', 'Le retour concerne une version anglaise de niveau A2 à C1 ou originale.');
  }
  return { showId: row.showId, publicationId: row.publicationId, level: level as Level };
}

/** POST : rating=null annule, un nouvel envoi corrige le même retour sans allonger la série. */
export async function saveFeedback(req: Request, env: Env, id: string, key: string): Promise<Response> {
  const body = await readJson<unknown>(req, 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => !['publicationId', 'rating'].includes(k)) ||
      typeof b.publicationId !== 'string' || b.publicationId.length === 0 || b.publicationId.length > 128 ||
      ![null, 'too_easy', 'just_right', 'too_hard'].includes(b.rating as Rating | null)) invalid();
  const target = await feedbackTarget(env, id, key, b.publicationId as string);
  if (b.rating === null) {
    await env.DB.prepare('DELETE FROM level_feedback WHERE publication_id=? AND variant_key=?')
      .bind(target.publicationId, key).run();
  } else {
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO level_feedback
      (publication_id,content_id,variant_key,show_id,level,rating,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(publication_id,variant_key) DO UPDATE SET
        rating=excluded.rating, updated_at=excluded.updated_at`)
      .bind(target.publicationId, id, key, target.showId, target.level, b.rating, now, now).run();
  }
  return json({ feedback: b.rating === null ? null : {
    contentId: id, variantKey: key, ...target, rating: b.rating,
  }, levelSuggestion: await levelSuggestion(env, target.showId) });
}

function invalid(): never {
  throw new HttpError(400, 'invalid_body', 'publicationId et rating (too_easy, just_right, too_hard ou null) attendus.');
}

export async function getSuggestion(env: Env, showId: string): Promise<Response> {
  return json({ levelSuggestion: await levelSuggestion(env, showId) });
}
