import type { Env } from '../env';
import { HttpError, json } from '../http';
export type Item = { type: string; id: string; title: string; publisher: string; href: string };
export async function items(req: Request, env: Env) {
  const p = new URL(req.url).searchParams;
  const after = Number(p.get('after') || 0), limit = Number(p.get('limit') || 200);
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200)
    throw new HttpError(400, 'invalid_cursor', 'Curseur ou limite invalide.');
  const { results } = await env.DB.prepare(`SELECT c.seq,c.type,c.id,l.sourceKind,l.title,l.excerpt,l.language,l.publishedAt,c.updated_at AS updatedAt,l.publisher,
    CASE WHEN l.id IS NULL THEN 1 ELSE 0 END AS deleted FROM related_changes c
    LEFT JOIN related_live l ON l.type=c.type AND l.id=c.id WHERE c.seq>? ORDER BY c.seq LIMIT ?`).bind(after,limit).all<{seq:number}>();
  return json({ items: results, nextCursor: results.at(-1)?.seq ?? after, hasMore: results.length === limit });
}
