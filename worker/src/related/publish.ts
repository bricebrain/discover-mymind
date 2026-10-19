import type { Env } from '../env';
import { json, readJson } from '../http';
import { validate } from './validation';
import { live } from './live';
const src = live("json_extract(s.value,'$.type')", "json_extract(s.value,'$.id')", 'a');
const tgt = live("json_extract(n.value,'$.targetType')", "json_extract(n.value,'$.targetId')", 't');
const mem = live("json_extract(m.value,'$.type')", "json_extract(m.value,'$.id')", 'l');
export async function publish(req: Request, env: Env) {
  const b=validate(await readJson(req,100_000));
  const sources=JSON.stringify(b.sources), groups=JSON.stringify(b.groups);
  // Six requêtes fixes, même pour 200 liens : une transaction D1.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM related_links WHERE EXISTS(SELECT 1 FROM json_each(?) s
      WHERE json_extract(s.value,'$.type')=source_type AND json_extract(s.value,'$.id')=source_id)`).bind(sources),
    env.DB.prepare(`INSERT INTO related_links SELECT json_extract(s.value,'$.type'),json_extract(s.value,'$.id'),
      json_extract(n.value,'$.targetType'),json_extract(n.value,'$.targetId'),json_extract(n.value,'$.score')
      FROM json_each(?) s JOIN json_each(s.value,'$.neighbors') n ${src.joins} ${tgt.joins}
      WHERE ${src.exists} AND ${tgt.exists}`).bind(sources),
    env.DB.prepare(`DELETE FROM related_members WHERE group_id IN (SELECT json_extract(value,'$.groupId') FROM json_each(?))`).bind(groups),
    env.DB.prepare(`DELETE FROM related_groups WHERE id IN (SELECT json_extract(value,'$.groupId') FROM json_each(?) WHERE json_array_length(value,'$.members')=0)`).bind(groups),
    env.DB.prepare(`INSERT INTO related_groups SELECT json_extract(value,'$.groupId'),json_extract(value,'$.title'),
      json_extract(value,'$.dossierCandidate'),?,value FROM json_each(?) WHERE json_array_length(value,'$.members')>0
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,dossier_candidate=excluded.dossier_candidate,
      updated_at=excluded.updated_at,payload=excluded.payload WHERE payload<>excluded.payload`).bind(new Date().toISOString(),groups),
    env.DB.prepare(`INSERT INTO related_members SELECT json_extract(g.value,'$.groupId'),json_extract(m.value,'$.type'),json_extract(m.value,'$.id')
      FROM json_each(?) g JOIN json_each(g.value,'$.members') m ${mem.joins} WHERE ${mem.exists}`).bind(groups),
  ]);
  return json({ok:true});
}
