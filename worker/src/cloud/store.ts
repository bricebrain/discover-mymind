import type { Env } from '../env';
import { HttpError } from '../http';
import { assertLease } from '../publications/store';
import { MONTHLY_MICROS, type CloudRun } from './types';

export const utcMonth=() => new Date().toISOString().slice(0,7);
export const enabled=(env:Env) => env.CLOUD_ATELIER_ENABLED==='true' && !!env.GEMINI_API_KEY && !!env.DEEPGRAM_API_KEY;
export function assertEnabled(env:Env) {
  if (!enabled(env)) throw new HttpError(503,'cloud_disabled','L’Atelier sans Mac n’est pas activé.');
}
export function monthlyLimit(env:Env) {
  const n=Number(env.CLOUD_MONTHLY_USD ?? String(MONTHLY_MICROS/1_000_000));
  return Number.isFinite(n) && n>=0 && n<=100 ? Math.floor(n*1_000_000) : 0;
}
export async function run(env:Env,id:string) {
  const row=await env.DB.prepare('SELECT * FROM cloud_runs WHERE id=?').bind(id).first<CloudRun>();
  if (!row) throw new HttpError(404,'not_found','Préparation cloud inconnue.');
  return row;
}
export async function active(env:Env,id:string,stage:string) {
  assertEnabled(env);
  const row=await run(env,id);
  if (row.month!==utcMonth()) throw new Error('Le mois a changé : une nouvelle autorisation de dépense est nécessaire.');
  await assertLease(env,{queue_item_id:id,lease_token:row.lease_token});
  await env.DB.prepare(`UPDATE prepare_queue SET stage=?,updated_at=? WHERE id=? AND status='leased' AND lease_token=?`)
    .bind(stage,new Date().toISOString(),id,row.lease_token).run();
  return row;
}
export async function fail(env:Env,id:string) {
  // L'enveloppe reste engagée, même après annulation ou réponse perdue. Jamais de remboursement fictif.
  const message='Préparation arrêtée. Les étapes déjà envoyées ne sont pas relancées ; enveloppe conservée dans le budget cloud.';
  await env.DB.batch([
    env.DB.prepare(`UPDATE cloud_runs SET state='failed',error=?,updated_at=? WHERE id=? AND state<>'done'`)
      .bind(message,new Date().toISOString(),id),
    env.DB.prepare(`UPDATE prepare_queue SET status='failed',error=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND status IN ('pending','leased')`)
      .bind(message,new Date().toISOString(),id),
  ]);
}
