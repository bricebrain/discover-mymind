import type { Env } from '../env';

/** Le journal monétaire reste ; les copies de travail ne survivent pas indéfiniment aux notes. */
export async function cleanupCloud(env:Env) {
  const before=new Date(Date.now()-30*86_400_000).toISOString();
  const old=await env.DB.prepare(`SELECT id FROM cloud_runs WHERE state IN ('done','failed') AND updated_at<? AND purged_at IS NULL LIMIT 5`)
    .bind(before).all<{id:string}>();
  for (const {id} of old.results) {
    const objects=await env.FILES.list({prefix:`cloud/${id}/`,limit:100});
    if (objects.objects.length) await env.FILES.delete(objects.objects.map(o=>o.key));
    if (objects.truncated) continue;
    await env.DB.prepare("UPDATE cloud_runs SET snapshot_json='{}',purged_at=? WHERE id=?").bind(new Date().toISOString(),id).run();
  }
  await env.DB.prepare('DELETE FROM cloud_quotes WHERE expires_at<?').bind(new Date().toISOString()).run();
}
