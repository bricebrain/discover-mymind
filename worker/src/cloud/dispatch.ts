import type { Env } from '../env';
import { enabled, fail } from './store';
import { cleanupCloud } from './cleanup';

export async function dispatch(env:Env,id:string) {
  const row=await env.DB.prepare(`SELECT r.state,q.status FROM cloud_runs r LEFT JOIN prepare_queue q ON q.id=r.id WHERE r.id=?`)
    .bind(id).first<{state:string;status:string}>();
  if (!row || row.state!=='reserved' || row.status!=='leased') return;
  try { await env.CLOUD_PREPARATION.create({id,params:{id}}); }
  catch {
    // create(id) peut avoir réussi alors que la réponse est perdue ; aucun autre identifiant n'est créé.
    // Le prochain cron réessaie le dispatch uniquement, jamais les appels fournisseurs.
  }
}
export async function recoverCloud(env:Env) {
  // La rétention continue même si le propriétaire coupe les générations.
  if (new Date().getUTCMinutes()===31) await cleanupCloud(env);
  if (!enabled(env)) return;
  const rows=await env.DB.prepare(`SELECT r.id,q.status,q.lease_expires_at FROM cloud_runs r LEFT JOIN prepare_queue q ON q.id=r.id
    WHERE r.state IN ('reserved','running') ORDER BY r.created_at LIMIT 20`)
    .all<{id:string;status:string|null;lease_expires_at:string|null}>();
  for (const row of rows.results) {
    if (row.status==='done') await env.DB.prepare("UPDATE cloud_runs SET state='done',updated_at=? WHERE id=?").bind(new Date().toISOString(),row.id).run();
    else if (row.status!=='leased' || !row.lease_expires_at || row.lease_expires_at<=new Date().toISOString()) await fail(env,row.id);
    else await dispatch(env,row.id);
  }
}
