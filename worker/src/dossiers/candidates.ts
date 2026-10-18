import type { Env } from '../env';
import { HttpError,json } from '../http';
export async function candidates(req:Request,env:Env) {
 const p=new URL(req.url).searchParams,q=(p.get('q')??'').trim(),offset=Number(p.get('offset')??0);
 if(q.length>200||!Number.isSafeInteger(offset)||offset<0||offset>100000) throw new HttpError(400,'invalid_search','Recherche ou pagination invalide.');
 const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
 const rows=await env.DB.prepare(`SELECT * FROM (
  SELECT 'episode' AS type,e.id,e.title,CASE WHEN e.video_id IS NULL THEN 'Podcast' ELSE 'YouTube' END AS label,e.created_at AS date
   FROM episodes e WHERE e.state<>'dismissed'
  UNION ALL SELECT 'reflection',id,COALESCE(title,substr(body_md,1,80),'Note My Mind'),'My Mind',updated_at
   FROM reflections WHERE deleted_at IS NULL AND length(trim(body_md))>=20
  UNION ALL SELECT 'content',c.id,c.title,'Contenu préparé',c.updated_at FROM contents c JOIN publications p ON p.id=c.current_publication_id
   WHERE c.deleted_at IS NULL AND p.status='ready' AND c.source_type<>'dossier'
 ) WHERE title LIKE ? ESCAPE '\\' ORDER BY date DESC,type,id LIMIT 31 OFFSET ?`).bind(pattern,offset).all();
 return json({sources:rows.results.slice(0,30),nextOffset:rows.results.length>30?offset+30:null});
}
