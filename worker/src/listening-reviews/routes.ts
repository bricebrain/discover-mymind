import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { visible } from '../routes/contents';
import type { Segments } from '../publications/types';

export const REVIEW_DAYS = [1, 3, 7] as const;
export const UNDERSTOOD = 0.9;
const parisDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);

/** L’échéance existante reste stable pendant une même dictée ; une nouvelle version repart à J+1. */
export function scheduleReview(env: Env, contentId: string, publicationId: string, key: string, now: string) {
  const due = new Date(Date.parse(now) + 86_400_000).toISOString();
  return env.DB.prepare(`INSERT INTO listening_reviews
    (content_id,publication_id,variant_key,step,due_at,created_at,updated_at) VALUES (?,?,?,1,?,?,?)
    ON CONFLICT(content_id) DO UPDATE SET publication_id=excluded.publication_id,variant_key=excluded.variant_key,
      step=1,due_at=excluded.due_at,last_done_at=NULL,last_accuracy=NULL,updated_at=excluded.updated_at
    WHERE listening_reviews.publication_id<>excluded.publication_id OR listening_reviews.variant_key<>excluded.variant_key`)
    .bind(contentId, publicationId, key, due, now, now);
}

export async function due(env: Env) {
  // Journée Europe/Paris : les échéances du jour sont proposées dès le matin.
  const today = parisDay(new Date());
  const upper = new Date(Date.parse(today) + 86_400_000).toISOString();
  const { results } = await env.DB.prepare(`SELECT r.content_id AS contentId,r.publication_id AS publicationId,
    r.variant_key AS variantKey,r.step,r.due_at AS dueAt,c.title,f.r2_key AS r2Key
    FROM listening_reviews r JOIN contents c ON c.id=r.content_id AND c.current_publication_id=r.publication_id
    JOIN publications p ON p.id=r.publication_id AND p.status='ready'
    JOIN variants v ON v.publication_id=r.publication_id AND v.variant_key=r.variant_key
    JOIN publication_files f ON f.publication_id=v.publication_id AND f.path=v.segments_path
    WHERE c.deleted_at IS NULL AND r.due_at<? ORDER BY r.due_at,r.content_id LIMIT 100`).bind(upper)
    .all<{ contentId: string; publicationId: string; variantKey: string; step: number; dueAt: string; title: string; r2Key: string }>();
  const reviews = [];
  for (const { r2Key, ...row } of results) {
    if (parisDay(new Date(row.dueAt)) > today) continue;
    const file = await env.FILES.get(r2Key);
    if (!file) continue;
    const doc = await file.json<Segments>();
    const passage = doc.guide?.passage;
    if (!passage) continue;
    const first = doc.segments.find(s => s.id === passage.fromSegment), last = doc.segments.find(s => s.id === passage.toSegment);
    if (first?.startMs == null || last?.endMs == null) continue;
    reviews.push({ ...row, passage: { ...passage, startMs: first.startMs, endMs: last.endMs } });
  }
  return json({ reviews }, 200, { 'Cache-Control': 'no-store' });
}

export async function done(req: Request, env: Env, contentId: string) {
  const b = await readJson<{ publicationId?: unknown; variantKey?: unknown } | null>(req, 1024);
  if (!b || typeof b.publicationId !== 'string' || typeof b.variantKey !== 'string')
    throw new HttpError(400, 'invalid_review', 'Publication et version requises.');
  await visible(env, contentId, b.publicationId);
  const row = await env.DB.prepare('SELECT * FROM listening_reviews WHERE content_id=? AND publication_id=? AND variant_key=?')
    .bind(contentId, b.publicationId, b.variantKey).first<{ step: number; due_at: string; last_done_at: string | null }>();
  if (!row) throw new HttpError(404, 'not_found', 'Réécoute introuvable.');
  const now = new Date().toISOString();
  const today = parisDay(new Date(now));
  if (parisDay(new Date(row.due_at)) > today) return json({ alreadyDone: true, dueAt: row.due_at, step: row.step });
  // Dernier essai de chaque phrase de cette version ; une répétition ne pèse pas deux fois dans le score.
  const accuracy = await env.DB.prepare(`SELECT SUM(a.correct_words)*1.0 / NULLIF(SUM(a.expected_words),0) AS accuracy
    FROM dictation_attempts a WHERE a.content_id=? AND a.publication_id=? AND a.variant_key=?
    AND NOT EXISTS (SELECT 1 FROM dictation_attempts b WHERE b.content_id=a.content_id
      AND b.publication_id=a.publication_id AND b.variant_key=a.variant_key AND b.segment_id=a.segment_id
      AND (b.created_at>a.created_at OR (b.created_at=a.created_at AND b.rowid>a.rowid)))`)
    .bind(contentId, b.publicationId, b.variantKey).first<{ accuracy: number | null }>();
  const value = accuracy?.accuracy ?? 0;
  const step = value >= UNDERSTOOD ? Math.min(3, row.step + 1) : 1;
  const dueAt = new Date(Date.parse(now) + REVIEW_DAYS[step - 1]! * 86_400_000).toISOString();
  const result = await env.DB.prepare(`UPDATE listening_reviews SET step=?,due_at=?,last_done_at=?,last_accuracy=?,updated_at=?
    WHERE content_id=? AND publication_id=? AND variant_key=? AND due_at=?`)
    .bind(step, dueAt, now, value, now, contentId, b.publicationId, b.variantKey, row.due_at).run();
  return json({ step, dueAt, accuracy: value, alreadyDone: !result.meta.changes });
}
