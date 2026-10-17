import type { Env } from '../env';
import { HttpError, json, noContent, readJson } from '../http';
import { prepareOptions, type PrepareOptions } from '../queue/options';
import { expireExhausted, QUEUE_SELECT, queueOut, type QueueRow } from '../queue/store';

/** Crée (ou retrouve) la demande active d'une source ; refuse d'autres options tant qu'une préparation tourne. */
async function insertQueue(env: Env, kind: 'episode' | 'youtube' | 'reflection', ref: string, options: PrepareOptions) {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?)`).bind(id,kind,ref,JSON.stringify(options),now,now).run();
  const row = await env.DB.prepare(`${QUEUE_SELECT} WHERE q.kind=? AND q.ref=? AND q.status IN ('pending','leased')`)
    .bind(kind,ref).first<QueueRow>();
  if (!row) throw new HttpError(409,'queue_changed','La demande a changé, réessayer.');
  if (row.options_json !== JSON.stringify(options)) throw new HttpError(409,'already_queued','Cette source a déjà une préparation en cours avec d’autres options.');
  return json({ item: queueOut(row) },row.id === id ? 201 : 200);
}

export async function enqueue(req: Request, env: Env, episodeId: string) {
  const ep = await env.DB.prepare(`SELECT e.duration_sec,s.language FROM episodes e JOIN shows s ON s.id=e.show_id WHERE e.id=?`)
    .bind(episodeId).first<{ duration_sec: number | null; language: string }>();
  if (!ep) throw new HttpError(404,'not_found','Épisode introuvable.');
  return insertQueue(env,'episode',episodeId,prepareOptions(await readJson(req,4096),ep.language,ep.duration_sec));
}

/** POST /api/reflections/:id/prepare — envoi explicite d'une note à l'Atelier. */
export async function enqueueReflection(req: Request, env: Env, id: string) {
  const note = await env.DB.prepare('SELECT body_md FROM reflections WHERE id=? AND deleted_at IS NULL').bind(id).first<{ body_md: string }>();
  if (!note) throw new HttpError(404,'not_found','Note introuvable.');
  if (note.body_md.trim().length < 20) throw new HttpError(422,'note_too_short','La note est trop courte pour être préparée.');
  // Une note est courte : intégral par défaut ; la traduction fidèle est permise (notes surtout en français).
  return insertQueue(env,'reflection',id,prepareOptions(await readJson(req,4096),'fr',null));
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export function youtubeId(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/**
 * POST /atelier/sources — l'Atelier envoie une source à préparer :
 * { kind: 'youtube', url, options } ou { kind: 'text', title, text, options } (le texte devient une note My Mind).
 */
export async function enqueueSource(req: Request, env: Env) {
  const b = await readJson<Record<string, unknown>>(req, 120_000);
  const options = b.options ?? {};
  if (b.kind === 'youtube') {
    const id = typeof b.url === 'string' ? youtubeId(b.url) : null;
    if (!id) throw new HttpError(422,'invalid_url','Lien YouTube invalide.');
    return insertQueue(env,'youtube',id,prepareOptions(options,'unknown',null));
  }
  if (b.kind === 'text') {
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    const title = typeof b.title === 'string' ? b.title.trim().slice(0,200) : '';
    if (text.length < 20 || text.length > 100_000) throw new HttpError(422,'invalid_text','Texte de 20 à 100 000 caractères attendu.');
    const prepared = prepareOptions(options,'fr',null);
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO reflections (id,title,body_md,kind,tags_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(id,title || null,text,'observation',JSON.stringify(['importé depuis l’Atelier']),now,now).run();
    return insertQueue(env,'reflection',id,prepared);
  }
  throw new HttpError(422,'invalid_source','Source attendue : youtube ou text.');
}
export async function list(req: Request, env: Env) {
  await expireExhausted(env);
  const params = new URL(req.url).searchParams;
  const kind = params.has('reflection') ? 'reflection' : 'episode';
  const ref = params.get('episode') ?? params.get('reflection');
  const rows = await env.DB.prepare(`${QUEUE_SELECT} ${ref ? `WHERE q.kind='${kind}' AND q.ref=?` : ''}
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
/** POST /api/queue/:id/remove — retire de l'historique une demande terminée, en échec ou annulée. */
export async function removeEntry(env: Env,id: string) {
  const r = await env.DB.prepare("DELETE FROM prepare_queue WHERE id=? AND status IN ('done','failed','cancelled')").bind(id).run();
  if (!r.meta.changes) throw new HttpError(409,'queue_active','Annule d’abord la préparation en cours.');
  await env.DB.prepare('DELETE FROM queue_events WHERE queue_id=?').bind(id).run();
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
