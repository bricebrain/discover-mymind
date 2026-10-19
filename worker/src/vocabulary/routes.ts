import type { Env } from '../env';
import { HttpError, json, noContent, readJson } from '../http';
import { manifest } from '../publications/store';
import { visible } from '../routes/contents';
import { sha256Hex } from '../security/crypto';
import { normalize, selection } from './validation';

const statuses = ['pending','sent','already_known','failed'];
async function create(req: Request, env: Env) {
  const b = selection(await readJson(req,20_000));
  const p = await visible(env,b.contentId,b.publicationId), m = await manifest(env,p);
  const v = m.variants.find((v)=>v.key===b.variantKey && v.language===b.language);
  if (!v) throw new HttpError(404,'not_found','Version anglaise indisponible.');
  const f = await env.DB.prepare('SELECT r2_key FROM publication_files WHERE publication_id=? AND path=?')
    .bind(p.id,v.segmentsFile).first<{r2_key:string}>();
  const object = f && await env.FILES.get(f.r2_key);
  if (!object) throw new HttpError(503,'segments_missing','Passages indisponibles.');
  const document = await object.json<{segments:{text:string}[]}>();
  const text = document.segments[b.segmentIndex]?.text;
  if (!text || !normalize(text).includes(normalize(b.sentence)) || !normalize(b.sentence).includes(normalize(b.word))) {
    throw new HttpError(400,'invalid_context','Le mot et sa phrase doivent appartenir au passage.');
  }
  const fingerprint = await sha256Hex(JSON.stringify([normalize(b.word),normalize(b.sentence),b.contentId,b.publicationId,b.variantKey,b.segmentIndex,b.language]));
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO vocabulary_picks
    (id,fingerprint,word,sentence,contentId,publicationId,variantKey,segmentIndex,language,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),fingerprint,b.word,b.sentence,b.contentId,
      b.publicationId,b.variantKey,b.segmentIndex,b.language,now,now).run();
  const pick = await env.DB.prepare('SELECT * FROM vocabulary_picks WHERE fingerprint=?').bind(fingerprint).first();
  return json({pick},inserted.meta.changes ? 201 : 200);
}
async function list(req: Request, env: Env) {
  const q = new URL(req.url).searchParams;
  const after = Number(q.get('after') ?? 0), limit = Number(q.get('limit') ?? 50), status = q.get('status');
  if (!Number.isSafeInteger(after) || after<0 || !Number.isSafeInteger(limit) || limit<1 || limit>100 ||
      (status!==null && !statuses.includes(status))) throw new HttpError(400,'invalid_pagination','Pagination ou statut invalide.');
  const {results} = await env.DB.prepare(`SELECT * FROM vocabulary_picks WHERE seq>? ${status ? 'AND status=?' : ''} ORDER BY seq LIMIT ?`)
    .bind(...(status ? [after,status,limit+1] : [after,limit+1])).all<{seq:number}>();
  const picks = results.slice(0,limit);
  return json({picks,nextAfter:results.length>limit ? picks[picks.length-1]!.seq : null});
}
async function result(req: Request, env: Env, id: string) {
  const b = await readJson<{status?:unknown;wordId?:unknown}|null>(req,2048);
  if (!b || !['sent','already_known','failed'].includes(String(b.status)) ||
      (b.status!=='failed' && (typeof b.wordId!=='string' || !b.wordId || b.wordId.length>200))) {
    throw new HttpError(400,'invalid_result','Résultat de synchronisation invalide.');
  }
  await env.DB.prepare(`UPDATE vocabulary_picks SET status=?,wordId=?,error=?,updatedAt=?
    WHERE id=? AND status IN ('pending','failed')`).bind(b.status,b.status==='failed' ? null : b.wordId,
      b.status==='failed' ? 'Synchronisation EnglishFluency échouée.' : null,new Date().toISOString(),id).run();
  const pick = await env.DB.prepare('SELECT * FROM vocabulary_picks WHERE id=?').bind(id).first();
  if (!pick) throw new HttpError(404,'not_found','Sélection introuvable.');
  return json({pick});
}
export async function vocabularyRoute(req: Request, env: Env, path: string, atelier=false): Promise<Response|null> {
  const base = atelier ? '/atelier/vocabulary/picks' : '/api/vocabulary/picks';
  if (path===base && req.method==='GET') return list(req,env);
  if (!atelier && path===base && req.method==='POST') return create(req,env);
  const suffix = path.startsWith(base+'/') ? path.slice(base.length+1) : '';
  const match = /^([0-9a-f-]{36})(\/result)?$/.exec(suffix);
  if (!match) return null;
  if (atelier && match[2] && req.method==='POST') return result(req,env,match[1]!);
  if (!atelier && !match[2] && req.method==='DELETE') {
    await env.DB.prepare('DELETE FROM vocabulary_picks WHERE id=?').bind(match[1]).run();
    return noContent();
  }
  return null;
}
