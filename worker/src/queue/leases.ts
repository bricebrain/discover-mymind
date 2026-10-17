import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { expireExhausted, queueOut, type QueueRow } from './store';

export const LEASE_MS = 15 * 60_000;
const STAGES = ['download','normalize','transcribe','source_ready','translate','adapt','tts','publish'];

export async function source(env: Env, row: QueueRow) {
  if (row.kind !== 'episode') throw new HttpError(422,'unsupported_source','Ce type de source sera disponible dans un prochain lot.');
  const episode = await env.DB.prepare(`SELECT e.id,e.title,e.audio_url AS audioUrl,e.transcript_url AS transcriptUrl,
    e.transcript_type AS transcriptType,e.duration_sec AS durationSec,s.language,s.category,s.title AS showTitle
    FROM episodes e JOIN shows s ON s.id=e.show_id WHERE e.id=?`).bind(row.ref).first();
  if (!episode) throw new HttpError(409,'source_missing','La source de la demande a disparu.');
  return episode;
}
export async function lease(req: Request,env: Env) {
  const body = await readJson<{ owner?: unknown; sourceOnly?: unknown }>(req,4096);
  if (!body || typeof body.owner !== 'string' || !/^[a-zA-Z0-9._-]{1,96}$/.test(body.owner)) {
    throw new HttpError(422,'invalid_owner','Identifiant d’Atelier invalide.');
  }
  if (body.sourceOnly !== undefined && typeof body.sourceOnly !== 'boolean') throw new HttpError(422,'invalid_options','Mode de préparation invalide.');
  const now = new Date().toISOString(), expires = new Date(Date.now()+LEASE_MS).toISOString();
  await expireExhausted(env,now);
  const row = await env.DB.prepare(`UPDATE prepare_queue SET status='leased',lease_token=?,lease_owner=?,
    lease_expires_at=?,attempts=attempts+1,stage='download',updated_at=?
    WHERE id=(SELECT id FROM prepare_queue WHERE kind='episode' AND
      (status='pending' OR (status='leased' AND lease_expires_at<=?)) AND attempts<max_attempts
      AND (?=0 OR COALESCE(stage,'')<>'source_ready')
      ORDER BY created_at,id LIMIT 1) RETURNING *`)
    .bind(crypto.randomUUID(),body.owner,expires,now,now,body.sourceOnly ? 1 : 0).first<QueueRow>();
  if (!row) return json({ item: null });
  try {
    const episode = await source(env,row);
    return json({ item: { ...queueOut({ ...row,title: String(episode.title) }), leaseToken: row.lease_token, source: episode } });
  } catch (e) {
    await env.DB.prepare("UPDATE prepare_queue SET status='failed',error='Source indisponible',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?")
      .bind(row.id,row.lease_token).run();
    throw e;
  }
}
export async function change(req: Request,env: Env,id: string,action: string) {
  const b = await readJson<Record<string,unknown>>(req,4096);
  if (!b || typeof b.leaseToken !== 'string' || b.leaseToken.length > 256) throw new HttpError(422,'invalid_lease','Jeton de bail requis.');
  const now = new Date().toISOString();
  let sql: string, args: unknown[];
  if (action === 'heartbeat') {
    if (typeof b.stage !== 'string' || !STAGES.includes(b.stage)) throw new HttpError(422,'invalid_stage','Étape invalide.');
    sql = 'lease_expires_at=?,stage=?,updated_at=?';
    args = [new Date(Date.now()+LEASE_MS).toISOString(),b.stage,now];
  } else if (action === 'release') {
    if (b.sourceReady !== undefined && typeof b.sourceReady !== 'boolean') throw new HttpError(422,'invalid_options','État de source invalide.');
    sql = "status='pending',attempts=MAX(0,attempts-1),stage=?,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=?";
    args = [b.sourceReady ? 'source_ready' : null,now];
  } else {
    if (typeof b.error !== 'string' || !b.error.trim() || b.error.length>500 || typeof b.retryable !== 'boolean') {
      throw new HttpError(422,'invalid_error','Erreur et possibilité de réessayer requises.');
    }
    sql = `status=CASE WHEN ?=1 AND attempts<max_attempts THEN 'pending' ELSE 'failed' END,
      error=?,stage=NULL,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=?`;
    args = [b.retryable ? 1 : 0,b.error,now];
  }
  const row = await env.DB.prepare(`UPDATE prepare_queue SET ${sql} WHERE id=? AND status='leased' AND lease_token=? AND lease_expires_at>? RETURNING *`)
    .bind(...args,id,b.leaseToken,now).first<QueueRow>();
  if (!row) throw new HttpError(409,'lease_lost','Le bail a expiré ou appartient à une autre instance.');
  return json({ item: queueOut(row) });
}
