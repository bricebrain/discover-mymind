import type { Env } from '../env';
import { HttpError } from '../http';
import type { FileRow, Manifest, Publication } from './types';
import { reject, validateContext } from './validation';

export async function publication(env: Env, id: string): Promise<Publication> {
  const p = await env.DB.prepare('SELECT * FROM publications WHERE id=?').bind(id).first<Publication>();
  if (!p) throw new HttpError(404, 'not_found', 'Publication inconnue.');
  return p;
}
export async function files(env: Env, id: string): Promise<FileRow[]> {
  return (await env.DB.prepare('SELECT * FROM publication_files WHERE publication_id=? ORDER BY path').bind(id).all<FileRow>()).results;
}
export async function manifest(env: Env, p: Publication): Promise<Manifest> {
  const obj = await env.FILES.get(p.manifest_r2_key);
  if (!obj) throw new HttpError(503, 'manifest_missing', 'Manifeste indisponible.');
  return obj.json<Manifest>();
}
export async function assertSource(env: Env, m: Manifest) {
  if (m.content.sourceType === 'podcast') {
    const ep = await env.DB.prepare('SELECT audio_url FROM episodes WHERE id=?').bind(m.content.sourceRef!.slice(8)).first<{ audio_url: string }>();
    if (!ep) reject('source_not_found');
    validateContext(m,{ episodeAudioUrl: ep.audio_url });
  }
  if (m.content.sourceType === 'reflection') {
    if (!await env.DB.prepare('SELECT id FROM reflections WHERE id=? AND deleted_at IS NULL').bind(m.content.sourceRef!.slice(11)).first()) reject('source_not_found');
  }
}
export async function current(env: Env, contentId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT current_publication_id FROM contents WHERE id=?').bind(contentId).first<{ current_publication_id: string | null }>();
  return row?.current_publication_id ?? null;
}
export async function assertRetained(env: Env, m: Manifest, currentId: string | null) {
  if (!currentId) return;
  const old = await env.DB.prepare('SELECT variant_key FROM variants WHERE publication_id=?').bind(currentId).all<{ variant_key: string }>();
  validateContext(m,{ currentVariants: old.results.map((v) => v.variant_key) });
}
export async function assertLease(env: Env, p: Pick<Publication, 'queue_item_id' | 'lease_token'>) {
  if (!p.queue_item_id) return;
  if (!await env.DB.prepare("SELECT id FROM prepare_queue WHERE id=? AND lease_token=? AND status='leased' AND lease_expires_at>?")
    .bind(p.queue_item_id, p.lease_token, new Date().toISOString()).first()) throw new HttpError(409, 'lease_lost', 'Le bail a expiré.');
}
