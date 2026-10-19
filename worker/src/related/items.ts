import type { Env } from '../env';
import { HttpError, json } from '../http';
import { live } from './live';
export type Item = { type: string; id: string; title: string; publisher: string; href: string };
export async function items(req: Request, env: Env) {
  const p = new URL(req.url).searchParams;
  const after = Number(p.get('after') || 0), limit = Number(p.get('limit') || 200);
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200)
    throw new HttpError(400, 'invalid_cursor', 'Curseur ou limite invalide.');
  const l = live('c.type', 'c.id', 'l');
  const { results } = await env.DB.prepare(`SELECT c.seq,c.type,c.id,
    CASE WHEN ${l.exists} THEN ${l.sourceKind} END AS sourceKind,CASE WHEN ${l.exists} THEN ${l.title} END AS title,
    CASE WHEN ${l.exists} THEN ${l.excerpt} END AS excerpt,CASE WHEN ${l.exists} THEN ${l.language} END AS language,
    CASE WHEN ${l.exists} THEN ${l.publishedAt} END AS publishedAt,c.updated_at AS updatedAt,
    CASE WHEN ${l.exists} THEN ${l.publisher} END AS publisher,CASE WHEN ${l.exists} THEN 0 ELSE 1 END AS deleted
    FROM related_changes c ${l.joins} WHERE c.seq>? ORDER BY c.seq LIMIT ?`).bind(after,limit).all<{seq:number}>();
  return json({ items: results, nextCursor: results.at(-1)?.seq ?? after, hasMore: results.length === limit });
}
