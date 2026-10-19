import type { Env } from '../env';
import { HttpError } from '../http';
import { manifest } from '../publications/store';
import type { Publication, Segments } from '../publications/types';

export interface SourceRef { type: 'episode' | 'content' | 'reflection'; id: string }
export interface Snapshot {
 id: string; type: SourceRef['type']; ref: string; title: string; language: string | null;
 kind: 'episode' | 'youtube' | 'reflection' | 'content'; capturedAt: string;
 audioUrl?: string; transcriptUrl?: string | null; transcriptType?: string | null;
 durationSec?: number | null; videoId?: string; url?: string; text?: string;
 origin?: string; sourceName?: string | null; sourceUrl?: string | null;
 publicationId?: string; variantKey?: string; segments?: Segments['segments'];
}
export function references(value: unknown): SourceRef[] {
 if (!Array.isArray(value) || value.length < 2 || value.length > 6) throw new HttpError(422,'invalid_sources','Choisir de 2 à 6 sources.');
 const refs = value.map((v: Record<string,unknown>) => {
  if (!v || !['episode','content','reflection'].includes(String(v.type)) || typeof v.id!=='string' ||
      !/^[a-z0-9-]{3,96}$/.test(v.id)) throw new HttpError(422,'invalid_sources','Référence source invalide.');
  return {type:v.type,id:v.id} as SourceRef;
 });
 if (new Set(refs.map(r=>r.type+':'+r.id)).size!==refs.length) throw new HttpError(422,'duplicate_source','Une source ne peut apparaître deux fois.');
 return refs;
}
export async function capture(env: Env, refs: SourceRef[]): Promise<Snapshot[]> {
 const result: Snapshot[]=[];
 for (const [i,r] of refs.entries()) {
  const base={id:`d${i+1}`,type:r.type,ref:r.id,capturedAt:new Date().toISOString()};
  if (r.type==='episode') {
   const e=await env.DB.prepare(`SELECT e.title,e.audio_url AS audioUrl,e.transcript_url AS transcriptUrl,
    e.transcript_type AS transcriptType,e.duration_sec AS durationSec,e.video_id AS videoId,s.language
    FROM episodes e JOIN shows s ON s.id=e.show_id WHERE e.id=?`).bind(r.id).first<{
     title:string;audioUrl:string;transcriptUrl:string|null;transcriptType:string|null;durationSec:number|null;videoId:string|null;language:string}>();
   if (!e) missing();
   result.push(e.videoId ? {...base,kind:'youtube',title:e.title,language:e.language,videoId:e.videoId,url:`https://www.youtube.com/watch?v=${e.videoId}`} : {...base,...e,kind:'episode',videoId:undefined});
  } else if (r.type==='reflection') {
   const n=await env.DB.prepare('SELECT title,body_md AS text,origin,source_name AS sourceName,source_url AS sourceUrl FROM reflections WHERE id=? AND deleted_at IS NULL').bind(r.id).first<{title:string|null;text:string;origin:string;sourceName:string|null;sourceUrl:string|null}>();
   if (!n || n.text.trim().length<20) missing();
   // Un article garde sa publication : la synthèse l'attribue au journal, pas à l'utilisateur.
   result.push({...base,kind:'reflection',title:n.title || 'Note My Mind',text:n.text,language:null,origin:n.origin,sourceName:n.sourceName,sourceUrl:n.sourceUrl});
  } else {
   const p=await env.DB.prepare(`SELECT p.* FROM publications p JOIN contents c ON c.current_publication_id=p.id
     WHERE c.id=? AND c.deleted_at IS NULL AND p.status='ready' AND c.source_type<>'dossier'`).bind(r.id).first<Publication>();
   if (!p) missing();
   const m=await manifest(env,p), v=m.variants.find(v=>v.kind==='source');
   if (!v) missing();
   const file=m.files[v.segmentsFile];
   if (!file || file.size>1_000_000) throw new HttpError(422,'source_too_large','Transcription trop volumineuse pour un dossier.');
   const obj=await env.FILES.get(`blobs/${file.sha256}`);
   if (!obj || obj.size>1_000_000) missing();
   const doc=await obj.json<Segments>();
   if (!doc.segments?.length) missing();
   result.push({...base,kind:'content',title:m.content.title,language:v.language,publicationId:p.id,variantKey:v.key,segments:doc.segments});
  }
 }
 // Évite de traiter deux fois le même épisode via sa version préparée.
 const canonical=await Promise.all(result.map(async s=> {
  if(s.type!=='content') return s.kind==='youtube' ? 'youtube:'+s.videoId : s.type+':'+s.ref;
  const c=await env.DB.prepare('SELECT source_ref FROM contents WHERE id=?').bind(s.ref).first<{source_ref:string|null}>();
  return c?.source_ref ?? 'content:'+s.ref;
 }));
 if(new Set(canonical).size!==result.length) throw new HttpError(422,'duplicate_source','Un épisode et sa version préparée comptent comme une seule source.');
 if(JSON.stringify(result).length>700_000 || result.reduce((n,s)=>n+(s.text?.length??0)+(s.segments?.reduce((n,s)=>n+s.text.length,0)??0),0)>150_000)
  throw new HttpError(422,'source_too_large','Limiter les textes du dossier à 150 000 caractères.');
 return result;
}
function missing(): never {throw new HttpError(422,'source_missing','Une source est indisponible, vide ou supprimée.');}
