import type { Env } from '../env';
import { HttpError, json } from '../http';
import { ref } from './validation';
import { live } from './live';

const nb = live('r.target_type', 'r.target_id', 'l'), mb = live('m.type', 'm.id', 'l');
const one = live('?1', '?2', 'l');
export async function related(req: Request, env: Env) {
  const p=new URL(req.url).searchParams, type=p.get('type'), id=p.get('id');
  if (!ref({type,id})) throw new HttpError(400,'invalid_related','Élément invalide.');
  const exists=await env.DB.prepare(`SELECT 1 AS ok FROM (SELECT 1) ${one.joins} WHERE ${one.exists}`).bind(type,id).first();
  if(!exists) return json({neighbors:[],groups:[]});
  const neighbors=await env.DB.prepare(`SELECT r.target_type AS type,r.target_id AS id,${nb.sourceKind} AS sourceKind,${nb.title} AS title,
    ${nb.publisher} AS publisher,${nb.href} AS href,r.score FROM related_links r ${nb.joins}
    WHERE r.source_type=? AND r.source_id=? AND ${nb.exists} ORDER BY r.score DESC,r.target_type,r.target_id LIMIT 5`).bind(type,id).all();
  const groups=await readGroups(env,`g.id IN (SELECT group_id FROM related_members WHERE type=? AND id=?)`,[type,id]);
  return json({neighbors:neighbors.results,groups});
}
async function readGroups(env:Env, where:string, values:unknown[]) {
  const rows=await env.DB.prepare(`SELECT g.id AS groupId,g.title,(g.dossier_candidate AND count(DISTINCT nullif(${mb.publisher},''))>=2) AS dossierCandidate,g.updated_at AS updatedAt,
    json_group_array(json_object('type',m.type,'id',m.id,'sourceKind',${mb.sourceKind},'title',${mb.title},'publisher',${mb.publisher},'href',${mb.href})) AS members
    FROM related_groups g JOIN related_members m ON m.group_id=g.id ${mb.joins}
    WHERE ${where} AND ${mb.exists} GROUP BY g.id HAVING count(*)>=2 ORDER BY g.updated_at DESC,g.id LIMIT 50`).bind(...values).all<{members:string;dossierCandidate:number}>();
  return rows.results.map(r=>({...r,dossierCandidate:Boolean(r.dossierCandidate),members:JSON.parse(r.members)}));
}
export async function groups(req:Request,env:Env) {
  const since=new URL(req.url).searchParams.get('since') || '1970-01-01T00:00:00.000Z';
  if(!Number.isFinite(Date.parse(since))) throw new HttpError(400,'invalid_since','Date invalide.');
  return json({groups:await readGroups(env,'g.updated_at>=?',[since])});
}
