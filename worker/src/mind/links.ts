import type { Env } from '../env';
import { HttpError } from '../http';
import { text } from './validation';
import type { Segments } from '../publications/types';

/** Titre lisible d'une cible, gardé dans le lien (§ 4 : le lien reste lisible si la cible disparaît). */
async function targetTitle(env: Env, type: string, id: string): Promise<string | null> {
  if (type === 'episode') {
    const e = await env.DB.prepare('SELECT e.title, s.title AS show FROM episodes e JOIN shows s ON s.id = e.show_id WHERE e.id = ?')
      .bind(id).first<{ title: string; show: string }>();
    return e ? `${e.title} — ${e.show}` : null;
  }
  const c = await env.DB.prepare('SELECT title FROM contents WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ title: string }>();
  return c?.title ?? null;
}

interface LinkInput { targetType?: unknown; targetId?: unknown; variantKey?: unknown; segmentId?: unknown; quote?: unknown }

export async function linkStatements(env: Env, reflectionId: string, links: unknown, now: string, mutationToken?: string) {
  if (links === undefined) return null;
  if (!Array.isArray(links) || links.length > 20) throw new HttpError(400, 'invalid_body', 'Liens : 20 au plus.');
  // Un jeton par requête évite qu’un PATCH perdant modifie les liens à date identique.
  const guard = mutationToken ? ' AND EXISTS (SELECT 1 FROM reflections WHERE id = ? AND mutation_token = ? AND deleted_at IS NULL)' : '';
  const guardValues = mutationToken ? [reflectionId, mutationToken] : [];
  const stmts = [env.DB.prepare(`DELETE FROM reflection_links WHERE reflection_id = ?${guard}`).bind(reflectionId, ...guardValues)];
  for (const l of links as LinkInput[]) {
    if (!l || typeof l !== 'object' || (l.targetType !== 'episode' && l.targetType !== 'content') || typeof l.targetId !== 'string' || !/^[a-z0-9-]{3,96}$/.test(l.targetId)) {
      throw new HttpError(400, 'invalid_body', 'Lien invalide.');
    }
    const title = await targetTitle(env, l.targetType, l.targetId);
    if (!title) throw new HttpError(422, 'unknown_target', 'La cible du lien n’existe pas.');
    const variant = text(l.variantKey, 'variantKey', 32) ?? '';
    const segment = text(l.segmentId, 'segmentId', 16) ?? '';
    await assertPassage(env, l.targetType, l.targetId, variant, segment);
    stmts.push(env.DB.prepare(
      `INSERT OR REPLACE INTO reflection_links (reflection_id, target_type, target_id, variant_key, segment_id, quote, target_title, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE 1=1${guard}`,
    ).bind(reflectionId, l.targetType, l.targetId, variant, segment,
      text(l.quote, 'quote', 500), title, now, ...guardValues));
  }
  return stmts;
}

async function assertPassage(env: Env, type: string, id: string, variant: string, segment: string) {
  if (!variant && !segment) return;
  if (type !== 'content' || !variant) throw new HttpError(400, 'invalid_body', 'Un passage nécessite un contenu et une variante.');
  const file = await env.DB.prepare(`SELECT f.r2_key FROM contents c
    JOIN publications p ON p.id=c.current_publication_id AND p.status='ready'
    JOIN variants v ON v.publication_id=p.id AND v.variant_key=?
    JOIN publication_files f ON f.publication_id=p.id AND f.path=v.segments_path
    WHERE c.id=? AND c.deleted_at IS NULL`).bind(variant, id).first<{ r2_key: string }>();
  if (!file) throw new HttpError(422, 'unknown_target', 'Variante indisponible.');
  if (!segment) return;
  const object = await env.FILES.get(file.r2_key);
  if (!object) throw new HttpError(503, 'segments_missing', 'Passages temporairement indisponibles.');
  const document = await object.json<Segments>();
  if (!document.segments.some((item) => item.id === segment)) {
    throw new HttpError(422, 'unknown_target', 'Passage inconnu dans cette variante.');
  }
}
