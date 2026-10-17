import type { Env } from '../env';
import { HttpError, json, noContent, readJson } from '../http';
import { prepareOptions } from '../queue/options';
import { expireExhausted, QUEUE_SELECT, queueOut, type QueueRow } from '../queue/store';

export async function enqueue(req: Request, env: Env, episodeId: string) {
  const ep = await env.DB.prepare(`SELECT e.duration_sec,s.language FROM episodes e JOIN shows s ON s.id=e.show_id WHERE e.id=?`)
    .bind(episodeId).first<{ duration_sec: number | null; language: string }>();
  if (!ep) throw new HttpError(404,'not_found','Épisode introuvable.');
  const options = prepareOptions(await readJson(req,4096),ep.language,ep.duration_sec);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at)
    VALUES (?,'episode',?,?,?,?)`).bind(id,episodeId,JSON.stringify(options),now,now).run();
  const row = await env.DB.prepare(`${QUEUE_SELECT} WHERE q.kind='episode' AND q.ref=? AND q.status IN ('pending','leased')`)
    .bind(episodeId).first<QueueRow>();
  if (!row) throw new HttpError(409,'queue_changed','La demande a changé, réessayer.');
  if (row.options_json !== JSON.stringify(options)) throw new HttpError(409,'already_queued','Cet épisode a déjà une préparation en cours avec d’autres options.');
  return json({ item: queueOut(row) },row.id === id ? 201 : 200);
}
export async function list(req: Request, env: Env) {
  await expireExhausted(env);
  const ref = new URL(req.url).searchParams.get('episode');
  const rows = await env.DB.prepare(`${QUEUE_SELECT} ${ref ? "WHERE q.kind='episode' AND q.ref=?" : ''}
    ORDER BY q.created_at DESC,q.id DESC LIMIT 100`).bind(...(ref ? [ref] : [])).all<QueueRow>();
  return json({ items: rows.results.map(queueOut) });
}
export async function cancel(env: Env,id: string) {
  const r = await env.DB.prepare(`UPDATE prepare_queue SET status='cancelled',lease_token=NULL,lease_owner=NULL,
    lease_expires_at=NULL,stage=NULL,updated_at=? WHERE id=? AND status IN ('pending','leased')`)
    .bind(new Date().toISOString(),id).run();
  if (!r.meta.changes) throw new HttpError(409,'queue_closed','Cette demande est déjà terminée ou annulée.');
  return noContent();
}
export async function retry(env: Env,id: string) {
  const r = await env.DB.prepare(`UPDATE prepare_queue SET status='pending',attempts=0,error=NULL,stage=NULL,
    lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND status IN ('failed','cancelled')
    AND NOT EXISTS (SELECT 1 FROM prepare_queue active WHERE active.kind=prepare_queue.kind AND active.ref=prepare_queue.ref
      AND active.status IN ('pending','leased'))`).bind(new Date().toISOString(),id).run();
  if (!r.meta.changes) throw new HttpError(409,'queue_conflict','Une préparation est déjà en cours ou la demande ne peut pas être relancée.');
  return noContent();
}
