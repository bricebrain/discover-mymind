import { ARTICLE_TEXTS_READY, resolveArticleTexts } from '../dossiers/article-texts';
import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { expireExhausted, queueOut, type QueueRow } from './store';
import { assertLease } from '../publications/store';

export const LEASE_MS = 15 * 60_000;
const STAGES = ['download','normalize','transcribe','source_ready','plan','extract','translate','adapt','evaluate','review','tts','publish'];

export async function source(env: Env, row: QueueRow) {
  if (row.kind === 'dossier') {
    const run=await env.DB.prepare('SELECT title,sources_json FROM dossier_runs WHERE id=?').bind(row.ref).first<{title:string;sources_json:string}>();
    if(!run) throw new HttpError(409,'source_missing','Sources du dossier indisponibles.');
    return {kind:'dossier',id:row.ref,title:run.title,language:'en',category:null,sources:JSON.parse(run.sources_json)};
  }
  if (row.kind === 'youtube') {
    const known = await env.DB.prepare(`SELECT e.title,s.language,s.category,s.title AS showTitle FROM episodes e
      JOIN shows s ON s.id=e.show_id WHERE e.video_id=? LIMIT 1`).bind(row.ref)
      .first<{ title: string; language: string; category: string; showTitle: string }>();
    return { kind: 'youtube', videoId: row.ref, url: `https://www.youtube.com/watch?v=${row.ref}`,
      title: known?.title ?? `YouTube ${row.ref}`, language: known?.language ?? null, category: known?.category ?? null };
  }
  if (row.kind === 'reflection') {
    const note = await env.DB.prepare('SELECT id,title,body_md AS text,origin,source_name AS sourceName,source_url AS sourceUrl FROM reflections WHERE id=? AND deleted_at IS NULL')
      .bind(row.ref).first<{ id: string; title: string | null; text: string; origin: string; sourceName: string | null; sourceUrl: string | null }>();
    if (!note || !note.text.trim()) throw new HttpError(409,'source_missing','La note de la demande a disparu ou est vide.');
    return { kind: 'reflection', id: note.id, title: note.title || note.text.split('\n')[0]!.replace(/^#+\s*/,'').slice(0,120) || 'Note My Mind',
      text: note.text, language: null, category: null, origin: note.origin, sourceName: note.sourceName, sourceUrl: note.sourceUrl };
  }
  const episode = await env.DB.prepare(`SELECT e.id,e.title,e.audio_url AS audioUrl,e.transcript_url AS transcriptUrl,
    e.transcript_type AS transcriptType,e.duration_sec AS durationSec,s.language,s.category,s.title AS showTitle
    FROM episodes e JOIN shows s ON s.id=e.show_id WHERE e.id=?`).bind(row.ref).first();
  if (!episode) throw new HttpError(409,'source_missing','La source de la demande a disparu.');
  return { kind: 'episode', ...episode };
}
export async function lease(req: Request,env: Env) {
  const body = await readJson<{ owner?: unknown; sourceOnly?: unknown; itemId?: unknown; includeReview?: unknown }>(req,4096);
  if (!body || typeof body.owner !== 'string' || !/^[a-zA-Z0-9._-]{1,96}$/.test(body.owner)) {
    throw new HttpError(422,'invalid_owner','Identifiant d’Atelier invalide.');
  }
  if (body.sourceOnly !== undefined && typeof body.sourceOnly !== 'boolean') throw new HttpError(422,'invalid_options','Mode de préparation invalide.');
  if ((body.itemId !== undefined && (typeof body.itemId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.itemId))) ||
      (body.includeReview !== undefined && typeof body.includeReview !== 'boolean') || (body.includeReview && !body.itemId)) {
    throw new HttpError(422,'invalid_options','Demande de relecture invalide.');
  }
  const now = new Date().toISOString(), expires = new Date(Date.now()+LEASE_MS).toISOString();
  await expireExhausted(env,now);
  await resolveArticleTexts(env);
  const row = await env.DB.prepare(`UPDATE prepare_queue SET status='leased',lease_token=?,lease_owner=?,
    lease_expires_at=?,attempts=attempts+1,stage='download',updated_at=?
    WHERE id=(SELECT id FROM prepare_queue WHERE
      (status='pending' OR (status='leased' AND lease_expires_at<=?)) AND attempts<max_attempts
      AND ${ARTICLE_TEXTS_READY}
      AND (?=0 OR COALESCE(stage,'')<>'source_ready')
      AND (?=1 OR COALESCE(stage,'')<>'review') AND (? IS NULL OR id=?)
      ORDER BY created_at,id LIMIT 1) RETURNING *`)
    .bind(crypto.randomUUID(),body.owner,expires,now,now,body.sourceOnly ? 1 : 0,body.includeReview ? 1 : 0,body.itemId ?? null,body.itemId ?? null).first<QueueRow>();
  if (!row) return json({ item: null });
  try {
    const origin = await source(env,row);
    return json({ item: { ...queueOut({ ...row,title: String(origin.title) }), leaseToken: row.lease_token, source: origin } });
  } catch (e) {
    await env.DB.prepare("UPDATE prepare_queue SET status='failed',error='Source indisponible',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?")
      .bind(row.id,row.lease_token).run();
    throw e;
  }
}
export async function change(req: Request,env: Env,id: string,action: string) {
  const b = await readJson<Record<string,unknown>>(req,4096);
  if (!b || typeof b.leaseToken !== 'string' || b.leaseToken.length > 256) throw new HttpError(422,'invalid_lease','Jeton de bail requis.');
  await assertLease(env,{queue_item_id:id,lease_token:b.leaseToken});
  const now = new Date().toISOString();
  let sql: string, args: unknown[];
  if (action === 'heartbeat') {
    if (typeof b.stage !== 'string' || !STAGES.includes(b.stage)) throw new HttpError(422,'invalid_stage','Étape invalide.');
    sql = 'lease_expires_at=?,stage=?,updated_at=?';
    args = [new Date(Date.now()+LEASE_MS).toISOString(),b.stage,now];
  } else if (action === 'release') {
    if (b.sourceReady !== undefined && typeof b.sourceReady !== 'boolean') throw new HttpError(422,'invalid_options','État de source invalide.');
    if (b.stage !== undefined && b.stage !== 'source_ready' && b.stage !== 'review') throw new HttpError(422,'invalid_stage','Point de reprise invalide.');
    sql = "status='pending',attempts=MAX(0,attempts-1),stage=?,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=?";
    args = [b.stage ?? (b.sourceReady ? 'source_ready' : null),now];
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
