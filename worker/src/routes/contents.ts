import type { Env } from '../env';
import { HttpError, json, noContent } from '../http';
import { manifest } from '../publications/store';
import type { Publication } from '../publications/types';

export async function visible(env: Env, id: string, revision?: string | null): Promise<Publication> {
  const p = await env.DB.prepare(`SELECT p.* FROM contents c JOIN publications p ON p.content_id=c.id
    WHERE c.id=? AND c.deleted_at IS NULL AND
    ((? IS NULL AND p.id=c.current_publication_id AND p.status='ready') OR
     (p.id=? AND (p.status='ready' OR (p.status='superseded' AND p.superseded_at>?))))`)
    .bind(id,revision ?? null,revision ?? null,new Date(Date.now()-7*86400_000).toISOString()).first<Publication>();
  if (!p) throw new HttpError(404, 'not_found', 'Contenu indisponible.');
  return p;
}
export async function library(req: Request, env: Env) {
  const params = new URL(req.url).searchParams;
  const offset = Number(params.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400,'invalid_pagination','Pagination invalide.');
  const type = params.get('type');
  if (type && !['podcast','youtube','reflection','dossier'].includes(type)) throw new HttpError(400,'invalid_type','Type de contenu inconnu.');
  const search = (params.get('q') ?? '').trim();
  if (search.length > 200) throw new HttpError(400,'invalid_search','Recherche limitée à 200 caractères.');
  const filters: string[] = [], values: string[] = [];
  if (type) { filters.push('c.source_type=?'); values.push(type); }
  if (search) {
    filters.push("c.title LIKE ? ESCAPE '\\'");
    values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const where = `FROM contents c JOIN publications p ON p.id=c.current_publication_id WHERE c.deleted_at IS NULL AND p.status='ready'
    ${filters.map((f) => `AND ${f}`).join(' ')}`;
  const rows = await env.DB.prepare(`SELECT c.id,c.title,c.original_language AS originalLanguage,c.source_type AS sourceType,c.category,c.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM variants v WHERE v.publication_id=p.id) AS variantCount ${where} ORDER BY c.updated_at DESC,c.id LIMIT 30 OFFSET ?`).bind(...values,offset).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total ${where}`).bind(...values).first<{ total: number }>();
  return json({ contents: rows.results, total: count?.total ?? 0, nextOffset: offset+rows.results.length < (count?.total ?? 0) ? offset+rows.results.length : null });
}
export async function detail(env: Env, id: string) {
  const p = await visible(env,id), m = await manifest(env,p);
  const statuses = await env.DB.prepare('SELECT variant_key,timing_status FROM variants WHERE publication_id=?').bind(p.id).all<{ variant_key: string; timing_status: string }>();
  return json({ content: m.content, publicationId: p.id, variants: m.variants.map((v) => {
    const base = `/api/contents/${id}/variants/${v.key}`;
    return { ...v, quiz: undefined, segmentsFile: undefined, segmentsUrl: `${base}/segments?publication=${p.id}`,
      timingStatus: statuses.results.find((s) => s.variant_key === v.key)?.timing_status,
      audio: v.audio ? { ...v.audio, file: undefined, url: v.audio.source === 'r2' ? `${base}/audio?publication=${p.id}` : v.audio.url,
        sha256: v.audio.file ? m.files[v.audio.file]?.sha256 : undefined } : null };
  }) });
}

export async function media(req: Request, env: Env, id: string, key: string, type: string) {
  const p = await visible(env,id,new URL(req.url).searchParams.get('publication'));
  const v = await env.DB.prepare('SELECT segments_path,audio_path,audio_source FROM variants WHERE publication_id=? AND variant_key=?')
    .bind(p.id,key).first<{ segments_path: string; audio_path: string | null; audio_source: string | null }>();
  if (!v || (type === 'audio' && v.audio_source !== 'r2')) throw new HttpError(404,'not_found','Média indisponible.');
  const f = await env.DB.prepare('SELECT r2_key,size,content_type FROM publication_files WHERE publication_id=? AND path=?')
    .bind(p.id,type === 'segments' ? v.segments_path : v.audio_path).first<{ r2_key: string; size: number; content_type: string }>();
  if (!f) throw new HttpError(404,'not_found','Fichier indisponible.');
  const range = req.headers.get('Range');
  let offset = 0, length = f.size;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return unsatisfiable(f.size);
    if (!match[1]) { length = Math.min(Number(match[2]),f.size); offset = f.size-length; }
    else { offset = Number(match[1]); const end = match[2] ? Math.min(Number(match[2]),f.size-1) : f.size-1; length = end-offset+1; }
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || offset >= f.size || length <= 0) return unsatisfiable(f.size);
  }
  const obj = await env.FILES.get(f.r2_key, { range: { offset,length } });
  if (!obj || !('body' in obj)) throw new HttpError(404,'not_found','Fichier indisponible.');
  const headers = new Headers({ 'Content-Type': f.content_type, 'Content-Length': String(length), 'Accept-Ranges': 'bytes', ETag: obj.httpEtag });
  if (range) headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${f.size}`);
  return new Response(obj.body,{ status: range ? 206 : 200, headers });
}
function unsatisfiable(size: number) { return new Response(null,{ status:416,headers:{ 'Content-Range':`bytes */${size}` } }); }

/**
 * DELETE /api/contents/:id — supprime un contenu préparé : invisible tout de suite, épisode / note détachés,
 * positions d'écoute effacées. Ses publications deviennent « remplacées » sans délai de grâce : le nettoyage
 * (cron) libère les fichiers R2 qui ne servent à rien d'autre. Les révisions sont renommées pour qu'une
 * nouvelle préparation identique puisse être republiée.
 */
export async function remove(env: Env, id: string) {
  const now = new Date().toISOString();
  const r = await env.DB.batch([
    env.DB.prepare('UPDATE contents SET deleted_at=?,current_publication_id=NULL,updated_at=? WHERE id=? AND deleted_at IS NULL').bind(now,now,id),
    env.DB.prepare(`UPDATE publications SET status=CASE WHEN status IN ('uploading','committing') THEN 'abandoned' WHEN status='ready' THEN 'superseded' ELSE status END,
      superseded_at=CASE WHEN status IN ('ready','superseded') THEN '1970-01-01T00:00:00.000Z' ELSE superseded_at END,
      revision=revision||':deleted:'||?,commit_token=NULL,updated_at=? WHERE content_id=? AND revision NOT LIKE '%:deleted:%'`).bind(now,now,id),
    env.DB.prepare('UPDATE episodes SET content_id=NULL WHERE content_id=?').bind(id),
    env.DB.prepare('UPDATE reflections SET english_content_id=NULL WHERE english_content_id=?').bind(id),
    env.DB.prepare('DELETE FROM quiz_answers WHERE publication_id IN (SELECT id FROM publications WHERE content_id=?)').bind(id),
    env.DB.prepare("DELETE FROM listening_progress WHERE target_type='variant' AND substr(target_id,1,?)=?").bind(id.length+1,id+':'),
    env.DB.prepare("DELETE FROM reflection_links WHERE target_type='content' AND target_id=?").bind(id),
    env.DB.prepare("DELETE FROM prepare_queue WHERE content_id=? AND status='done'").bind(id),
  ]);
  if (!r[0]!.meta.changes) throw new HttpError(404,'not_found','Contenu introuvable ou déjà supprimé.');
  return noContent();
}
