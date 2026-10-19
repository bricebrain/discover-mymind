import type { Env } from '../env';
import { HttpError } from '../http';
import type { NoteOut } from '../export/data';
import type { weekRange } from './week';

export const LIMITS = { activities: 200, noteRevisions: 500, links: 500 } as const;
export type WeekRange = ReturnType<typeof weekRange>;
export interface Listening {
  targetType: string; targetId: string; listenedMs: number; completed: number; title: string; sourceUrl: string | null;
}
export interface Article { id: string; title: string; url: string; wasRead: number; wasSaved: number }
export interface Publication { id: string; contentId: string; title: string; sourceUrl: string | null; publishedAt: string }
type Link = NoteOut['links'][number] & { noteId: string; deletedAt: string | null; sourceUrl: string | null };
interface Revision { snapshot: string; deletedAt: string | null }

/** Un batch donne une vue cohérente ; aucune table de sessions, file, secrets ou média n'est lue. */
export async function loadWeek(env: Env, range: WeekRange) {
  const query = (sql: string, ...values: (string | number)[]) => env.DB.prepare(sql).bind(...values);
  const result = await env.DB.batch([
    // Dernière photo de chaque note dans la semaine : la limite porte sur le nombre de notes, pas sur les révisions.
    query(`SELECT n.snapshot,r.deleted_at AS deletedAt FROM weekly_notes n JOIN reflections r ON r.id=n.note_id
      JOIN (SELECT note_id,max(changed_at) AS last FROM weekly_notes WHERE changed_at>=? AND changed_at<? GROUP BY note_id) x
        ON x.note_id=n.note_id AND x.last=n.changed_at
      ORDER BY n.changed_at,n.note_id LIMIT ?`, range.start, range.end, LIMITS.noteRevisions + 1),
    query(`SELECT r.deleted_at AS deletedAt,l.reflection_id AS noteId,l.target_type AS targetType,l.target_id AS targetId,
      nullif(l.variant_key,'') AS variantKey,nullif(l.segment_id,'') AS segmentId,l.quote,l.target_title AS targetTitle,coalesce(e.audio_url,c.source_url) AS sourceUrl
      FROM weekly_links l JOIN reflections r ON r.id=l.reflection_id
      LEFT JOIN episodes e ON l.target_type='episode' AND e.id=l.target_id
      LEFT JOIN contents c ON l.target_type='content' AND c.id=l.target_id
      WHERE l.created_at>=? AND l.created_at<?
      ORDER BY l.created_at,l.reflection_id,l.target_type,l.target_id,l.variant_key,l.segment_id LIMIT ?`, range.start, range.end, LIMITS.links + 1),
    query(`SELECT w.target_type AS targetType,w.target_id AS targetId,w.listened_ms AS listenedMs,w.completed,
      coalesce(e.title,c.title,w.target_id) AS title,coalesce(e.audio_url,c.source_url) AS sourceUrl
      FROM weekly_listening w
      LEFT JOIN episodes e ON w.target_type='episode' AND e.id=w.target_id
      LEFT JOIN contents c ON w.target_type='variant' AND c.id=substr(w.target_id,1,instr(w.target_id,':')-1)
      WHERE w.week=?
      ORDER BY w.target_type,w.target_id LIMIT ?`, range.week, LIMITS.activities + 1),
    query(`SELECT a.id,a.title,a.url,w.was_read AS wasRead,w.was_saved AS wasSaved
      FROM weekly_articles w JOIN articles a ON a.id=w.article_id
      WHERE w.week=? ORDER BY w.article_id LIMIT ?`, range.week, LIMITS.activities + 1),
    query(`SELECT c.deleted_at AS deletedAt,w.publication_id AS id,w.content_id AS contentId,w.title,w.source_url AS sourceUrl,w.published_at AS publishedAt
      FROM weekly_publications w JOIN contents c ON c.id=w.content_id
      WHERE w.published_at>=? AND w.published_at<?
      ORDER BY w.published_at,w.publication_id LIMIT ?`, range.start, range.end, LIMITS.activities + 1),
  ]);
  const caps = [LIMITS.noteRevisions, LIMITS.links, LIMITS.activities, LIMITS.activities, LIMITS.activities];
  if (result.some((r, i) => r.results.length > caps[i]!)) {
    throw new HttpError(422, 'weekly_limit_exceeded', 'Semaine trop volumineuse pour un bilan borné. Aucun résultat partiel.');
  }
  const notes = new Map<string, NoteOut>();
  for (const row of result[0]!.results as unknown as Revision[]) {
    if (row.deletedAt) continue;
    const snapshot = JSON.parse(row.snapshot) as NoteOut;
    notes.set(snapshot.id, { ...snapshot, tags: [], questionState: null, englishContentId: null, deletedAt: null, links: [] });
  }
  const linksByTarget = new Map<string, Link>();
  for (const link of result[1]!.results as unknown as Link[]) {
    if (link.deletedAt) continue;
    linksByTarget.set(JSON.stringify([link.noteId, link.targetType, link.targetId, link.variantKey, link.segmentId]), link);
  }
  const links = [...linksByTarget.values()];
  for (const { noteId, ...link } of links) notes.get(noteId)?.links.push(link);
  return {
    notes: [...notes.values()].sort((a, b) => a.id.localeCompare(b.id)), links,
    listening: (result[2]!.results as unknown as Listening[]).filter(p => p.listenedMs > 0 || p.completed === 1), articles: result[3]!.results as unknown as Article[],
    publications: (result[4]!.results as unknown as (Publication & { deletedAt: string | null })[]).filter(p => !p.deletedAt),
  };
}
export type WeekData = Awaited<ReturnType<typeof loadWeek>>;

export function metrics(data: WeekData, range: WeekRange) {
  const within = (at: string) => at >= range.start && at < range.end;
  return {
    listenedMinutes: Math.round(data.listening.reduce((n, p) => n + p.listenedMs, 0) / 600) / 100,
    completedContents: data.listening.filter(p => p.completed === 1).length,
    notesCreated: data.notes.filter(n => within(n.createdAt)).length,
    notesModified: data.notes.filter(n => n.updatedAt !== n.createdAt && within(n.updatedAt)).length,
    articlesRead: data.articles.filter(a => a.wasRead === 1).length,
    articlesSaved: data.articles.filter(a => a.wasSaved === 1).length,
    linkedPassages: data.links.filter(l => l.segmentId || l.quote).length,
    publishedPreparations: data.publications.length,
  };
}
