import type { Env } from '../env';
import { json, readJson } from '../http';
import { validate } from './validation';
export async function publish(req: Request, env: Env) {
  const b=validate(await readJson(req,100_000));
  const sources=JSON.stringify(b.sources), groups=JSON.stringify(b.groups);
  // Six requêtes fixes, même pour 200 liens : une transaction D1.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM related_links WHERE EXISTS(SELECT 1 FROM json_each(?) s
      WHERE json_extract(s.value,'$.type')=source_type AND json_extract(s.value,'$.id')=source_id)`).bind(sources),
    env.DB.prepare(`INSERT INTO related_links SELECT a.type,a.id,t.type,t.id,json_extract(n.value,'$.score')
      FROM json_each(?) s JOIN json_each(s.value,'$.neighbors') n
      JOIN related_live a ON a.type=json_extract(s.value,'$.type') AND a.id=json_extract(s.value,'$.id')
      JOIN related_live t ON t.type=json_extract(n.value,'$.targetType') AND t.id=json_extract(n.value,'$.targetId')`).bind(sources),
    env.DB.prepare(`DELETE FROM related_members WHERE group_id IN (SELECT json_extract(value,'$.groupId') FROM json_each(?))`).bind(groups),
    env.DB.prepare(`DELETE FROM related_groups WHERE id IN (SELECT json_extract(value,'$.groupId') FROM json_each(?) WHERE json_array_length(value,'$.members')=0)`).bind(groups),
    env.DB.prepare(`INSERT INTO related_groups SELECT json_extract(value,'$.groupId'),json_extract(value,'$.title'),
      json_extract(value,'$.dossierCandidate'),?,value FROM json_each(?) WHERE json_array_length(value,'$.members')>0
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,dossier_candidate=excluded.dossier_candidate,
      updated_at=excluded.updated_at,payload=excluded.payload WHERE payload<>excluded.payload`).bind(new Date().toISOString(),groups),
    env.DB.prepare(`INSERT INTO related_members SELECT json_extract(g.value,'$.groupId'),l.type,l.id
      FROM json_each(?) g JOIN json_each(g.value,'$.members') m
      JOIN related_live l ON l.type=json_extract(m.value,'$.type') AND l.id=json_extract(m.value,'$.id')`).bind(groups),
  ]);
  return json({ok:true});
}
