import type { Env } from '../env';

/** Réservation D1 avant suppression R2 : aucune nouvelle référence ne peut arriver entre les deux. */
export async function cleanupPublications(env: Env, now = Date.now()) {
  const stale = new Date(now - 48 * 3600_000).toISOString();
  await env.DB.prepare("UPDATE publications SET status='uploading',commit_token=NULL WHERE status='committing' AND updated_at<?")
    .bind(new Date(now - 15 * 60_000).toISOString()).run();
  const grace = new Date(now - 7 * 86400_000).toISOString();
  await env.DB.prepare("UPDATE publications SET status='abandoned',commit_token=NULL WHERE status IN ('uploading','committing') AND updated_at<?").bind(stale).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO publication_gc (r2_key)
    SELECT DISTINCT f.r2_key FROM publication_files f WHERE NOT EXISTS (
      SELECT 1 FROM publication_files other JOIN publications p ON p.id=other.publication_id
      WHERE other.r2_key=f.r2_key AND (p.status IN ('ready','uploading','committing') OR (p.status='superseded' AND p.superseded_at>?))
    ) LIMIT 10`).bind(grace).run();
  const pending = await env.DB.prepare('SELECT r2_key FROM publication_gc LIMIT 10').all<{ r2_key: string }>();
  for (const { r2_key } of pending.results) {
    await env.FILES.delete(r2_key);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM publication_files WHERE r2_key=?').bind(r2_key),
      env.DB.prepare('DELETE FROM publication_gc WHERE r2_key=?').bind(r2_key),
    ]);
  }
  // Les lignes de publication restent comme clés d’idempotence, sans garder leur manifeste expiré.
  const expired = await env.DB.prepare(`SELECT id,manifest_r2_key FROM publications p
    WHERE (status IN ('failed','abandoned') OR (status='superseded' AND superseded_at<=?))
    AND NOT EXISTS (SELECT 1 FROM publication_files f WHERE f.publication_id=p.id)
    AND manifest_r2_key<>'' LIMIT 10`).bind(grace).all<{ id: string; manifest_r2_key: string }>();
  for (const p of expired.results) {
    await env.FILES.delete(p.manifest_r2_key);
    await env.DB.prepare("UPDATE publications SET manifest_r2_key='' WHERE id=?").bind(p.id).run();
  }
}
