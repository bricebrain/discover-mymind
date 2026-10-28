import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { remove as removeContent } from '../routes/contents';
import { cleanupPublications } from '../publications/cleanup';

/** Réinitialisation réservée au jeton Atelier, bornée à un instant et reprenable par petits lots. */
export async function resetPublications(req: Request, env: Env) {
  const body = await readJson<{ before?: unknown; confirm?: unknown; dryRun?: unknown }>(req, 1024);
  if (typeof body.before !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.before) ||
      !Number.isFinite(Date.parse(body.before)) || Date.parse(body.before) > Date.now() ||
      body.dryRun !== undefined && typeof body.dryRun !== 'boolean') throw new HttpError(422, 'invalid_reset', 'Date de remise à zéro invalide.');
  const before = body.before;
  if (!body.dryRun && body.confirm !== 'RESET_PUBLICATIONS_KEEP_NOTES') throw new HttpError(422, 'reset_confirmation', 'Confirmation de remise à zéro requise.');
  if (body.dryRun) return json({ before, ...await remaining(env, before) });

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_settings(key,value) VALUES ('content_reset_at',?)
      ON CONFLICT(key) DO UPDATE SET value=MAX(value,excluded.value)`).bind(before),
    env.DB.prepare(`UPDATE prepare_queue SET status='cancelled',lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      stage=NULL,error='Remise à zéro des publications.',updated_at=? WHERE created_at<=? AND status IN ('pending','leased')`)
      .bind(new Date().toISOString(), before),
    env.DB.prepare("UPDATE cloud_runs SET state='failed' WHERE created_at<=? AND state IN ('reserved','running')").bind(before),
    // Fichiers d'un upload interrompu : plus aucun bail ne peut les publier après la remise à zéro.
    env.DB.prepare("UPDATE publications SET status='abandoned',commit_token=NULL WHERE created_at<=? AND status IN ('uploading','committing')").bind(before),
  ]);
  const rows = await env.DB.prepare('SELECT id FROM contents WHERE created_at<=? AND deleted_at IS NULL LIMIT 10').bind(before).all<{ id: string }>();
  for (const row of rows.results) await removeContent(env, row.id);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM level_feedback WHERE content_id IN (SELECT id FROM contents WHERE created_at<=?)').bind(before),
    env.DB.prepare('DELETE FROM weekly_publications WHERE content_id IN (SELECT id FROM contents WHERE created_at<=?)').bind(before),
    env.DB.prepare(`DELETE FROM weekly_listening WHERE
      (target_type='episode' AND target_id IN (SELECT id FROM episodes WHERE created_at<=?)) OR
      (target_type='variant' AND EXISTS (SELECT 1 FROM contents c WHERE c.created_at<=? AND substr(target_id,1,length(c.id)+1)=c.id||':'))`).bind(before, before),
    env.DB.prepare("DELETE FROM listening_progress WHERE target_type='episode' AND target_id IN (SELECT id FROM episodes WHERE created_at<=?)").bind(before),
    env.DB.prepare(`DELETE FROM reflection_links WHERE
      (target_type='episode' AND target_id IN (SELECT id FROM episodes WHERE created_at<=?)) OR
      (target_type='article' AND target_id IN (SELECT id FROM articles WHERE created_at<=?))`).bind(before, before),
    env.DB.prepare('DELETE FROM articles WHERE created_at<=?').bind(before),
    env.DB.prepare('DELETE FROM episodes WHERE created_at<=? AND content_id IS NULL').bind(before),
  ]);
  await cleanupPublications(env);
  // Les checkpoints cloud sont des copies des anciens textes et audios ; le journal des dépenses reste.
  const cloud = await env.DB.prepare('SELECT id FROM cloud_runs WHERE created_at<=? AND purged_at IS NULL LIMIT 2').bind(before).all<{ id: string }>();
  for (const { id } of cloud.results) {
    const files = await env.FILES.list({ prefix: `cloud/${id}/`, limit: 100 });
    if (files.objects.length) await env.FILES.delete(files.objects.map(file => file.key));
    if (!files.truncated) await env.DB.prepare("UPDATE cloud_runs SET snapshot_json='{}',purged_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
  }
  return json({ before, ...await remaining(env, before) });
}

async function remaining(env: Env, before: string) {
  const counts = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM contents WHERE created_at<=? AND deleted_at IS NULL) AS contents,
    (SELECT COUNT(*) FROM articles WHERE created_at<=?) AS articles,
    (SELECT COUNT(*) FROM episodes WHERE created_at<=?) AS episodes,
    (SELECT COUNT(DISTINCT f.r2_key) FROM publication_files f JOIN publications p ON p.id=f.publication_id
      WHERE p.created_at<=? AND p.status IN ('abandoned','superseded','failed')
        AND NOT EXISTS(SELECT 1 FROM publication_files other JOIN publications live ON live.id=other.publication_id
          WHERE other.r2_key=f.r2_key AND live.status IN ('ready','uploading','committing'))) AS files,
    (SELECT COUNT(*) FROM publications WHERE created_at<=? AND status IN ('abandoned','superseded','failed') AND manifest_r2_key<>'') AS manifests,
    (SELECT COUNT(*) FROM cloud_runs WHERE created_at<=? AND purged_at IS NULL) AS cloudCopies,
    (SELECT COUNT(*) FROM reflections WHERE deleted_at IS NULL) AS notesKept`)
    .bind(before, before, before, before, before, before).first<Record<string, number>>();
  return counts;
}
