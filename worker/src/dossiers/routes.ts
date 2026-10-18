import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { prepareOptions } from '../queue/options';
import { insertQueue } from '../routes/queue';
import { capture, references, type SourceRef } from './sources';

interface Dossier {id:string;title:string;version:number;sources_json:string;created_at:string;updated_at:string}
const out=(d:Dossier)=>({id:d.id,title:d.title,version:d.version,sources:JSON.parse(d.sources_json) as SourceRef[],createdAt:d.created_at,updatedAt:d.updated_at});
/** Titres actuels des sources (une source supprimée depuis reste listée, marquée indisponible). */
async function withTitles(env:Env,dossiers:ReturnType<typeof out>[]) {
 const refs=[...new Set(dossiers.flatMap(d=>d.sources.map(s=>s.type+':'+s.id)))];
 const titles=new Map<string,string>();
 for(const ref of refs){
  const [type,id]=ref.split(':') as [SourceRef['type'],string];
  const sql=type==='episode'?'SELECT title FROM episodes WHERE id=?':type==='reflection'?"SELECT COALESCE(title,substr(body_md,1,80)) AS title FROM reflections WHERE id=? AND deleted_at IS NULL":'SELECT title FROM contents WHERE id=? AND deleted_at IS NULL';
  const row=await env.DB.prepare(sql).bind(id).first<{title:string}>();
  if(row) titles.set(ref,row.title);
 }
 return dossiers.map(d=>({...d,sources:d.sources.map(s=>({...s,title:titles.get(s.type+':'+s.id)??null}))}));
}
const title=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>200) throw new HttpError(422,'invalid_title','Titre de 1 à 200 caractères attendu.');return v.trim();};
async function load(env:Env,id:string) {
 const d=await env.DB.prepare('SELECT * FROM dossiers WHERE id=?').bind(id).first<Dossier>();
 if(!d) throw new HttpError(404,'not_found','Dossier introuvable.');return d;
}
export async function route(req:Request,env:Env,path:string):Promise<Response|null> {
 if(path==='/api/dossiers'&&req.method==='GET') {
  const rows=await env.DB.prepare('SELECT * FROM dossiers ORDER BY updated_at DESC LIMIT 100').all<Dossier>();
  return json({dossiers:await withTitles(env,rows.results.map(out))});
 }
 if(path==='/api/dossiers'&&req.method==='POST') {
  const b=await readJson<Record<string,unknown>>(req,4096),refs=references(b.sources),t=title(b.title);
  await capture(env,refs); // Refuser immédiatement les sources non exploitables.
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO dossiers(id,title,sources_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,t,JSON.stringify(refs),now,now).run();
  return json({dossier:out(await load(env,id))},201);
 }
 const match=path.match(/^\/api\/dossiers\/([0-9a-f-]{36})(\/prepare)?$/);
 if(!match) return null;
 const d=await load(env,match[1]!);
 if(!match[2]&&req.method==='GET') {
  const runs=await env.DB.prepare(`SELECT r.id,r.version,r.created_at AS createdAt,q.status,q.content_id AS contentId
   FROM dossier_runs r LEFT JOIN prepare_queue q ON q.id=(SELECT id FROM prepare_queue WHERE kind='dossier' AND ref=r.id ORDER BY created_at DESC LIMIT 1)
   WHERE dossier_id=? ORDER BY r.created_at DESC LIMIT 30`).bind(d.id).all();
  return json({dossier:(await withTitles(env,[out(d)]))[0],runs:runs.results});
 }
 if(!match[2]&&req.method==='PATCH') {
  const b=await readJson<Record<string,unknown>>(req,4096),refs=references(b.sources),t=title(b.title);
  if(!Number.isInteger(b.version)) throw new HttpError(422,'invalid_version','Version du dossier requise.');
  await capture(env,refs);
  const r=await env.DB.prepare('UPDATE dossiers SET title=?,sources_json=?,version=version+1,updated_at=? WHERE id=? AND version=?')
   .bind(t,JSON.stringify(refs),new Date().toISOString(),d.id,b.version).run();
  if(!r.meta.changes) throw new HttpError(409,'conflict','Le dossier a été modifié ailleurs. Recharger avant de réessayer.');
  return json({dossier:out(await load(env,d.id))});
 }
 if(match[2]&&req.method==='POST') {
  const options=prepareOptions(await readJson(req,4096),'en',null);
  if(options.coverage==='full'||options.faithful||options.keepOriginalCopy) throw new HttpError(422,'invalid_options','Un dossier propose un condensé ou l’essentiel, sans copie ni traduction intégrale des originaux.');
  const serialized=JSON.stringify(options);
  let run=await env.DB.prepare('SELECT id FROM dossier_runs WHERE dossier_id=? AND version=? AND options_json=?').bind(d.id,d.version,serialized).first<{id:string}>();
  if(!run) {
   const snapshots=await capture(env,JSON.parse(d.sources_json));
   await env.DB.prepare('INSERT OR IGNORE INTO dossier_runs(id,dossier_id,version,title,sources_json,options_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),d.id,d.version,d.title,JSON.stringify(snapshots),serialized,new Date().toISOString()).run();
   run=await env.DB.prepare('SELECT id FROM dossier_runs WHERE dossier_id=? AND version=? AND options_json=?').bind(d.id,d.version,serialized).first<{id:string}>();
  }
  return insertQueue(env,'dossier',run!.id,options);
 }
 return null;
}
