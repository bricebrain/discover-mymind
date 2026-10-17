import type { Env } from '../env';
import { HttpError, json } from '../http';
import { assertLease, files, publication } from './store';
import { validPath } from './validation';

export async function upload(req: Request, env: Env, id: string, rawPath: string) {
  let path: string;
  try { path = decodeURIComponent(rawPath); } catch { throw new HttpError(400, 'invalid_path', 'Chemin invalide.'); }
  if (!validPath(path)) throw new HttpError(400, 'invalid_path', 'Chemin invalide.');
  const p = await publication(env, id);
  await assertLease(env, p);
  if (p.status !== 'uploading') throw new HttpError(409, 'publication_closed', 'Publication fermée.');
  const f = (await files(env, id)).find((f) => f.path === path);
  if (!f) throw new HttpError(404, 'file_not_declared', 'Fichier absent du manifeste.');
  if (req.headers.get('x-content-sha256') !== f.sha256) throw new HttpError(422, 'checksum_mismatch', 'Empreinte différente du manifeste.');
  if (Number(req.headers.get('Content-Length')) !== f.size) throw new HttpError(422, 'size_mismatch', 'Content-Length différent du manifeste.');
  if (req.headers.get('Content-Type') !== f.content_type) throw new HttpError(422, 'content_type_mismatch', 'Type différent du manifeste.');
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE publications SET updated_at=? WHERE id=? AND status='uploading'").bind(now,id).run();
  const existing = await env.FILES.head(f.r2_key);
  if (!existing) {
    if (!req.body) throw new HttpError(422, 'empty_file', 'Fichier vide.');
    try {
      await env.FILES.put(f.r2_key, req.body, { sha256: f.sha256, onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: f.content_type } });
    } catch { throw new HttpError(422, 'upload_rejected', 'R2 a refusé le fichier (taille ou empreinte incorrecte).'); }
  } else await req.body?.cancel();
  const stored = await env.FILES.head(f.r2_key);
  if (!stored || stored.size !== f.size) throw new HttpError(422, 'size_mismatch', 'Taille R2 différente du manifeste.');
  await env.DB.prepare('UPDATE publication_files SET uploaded_at=? WHERE publication_id=? AND path=?').bind(now,id,path).run();
  return json({ ok: true });
}
