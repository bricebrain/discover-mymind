import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { sha256Hex } from '../security/crypto';
import { assertLease, assertRetained, assertSource, current, files, publication } from './store';
import type { Publication } from './types';
import { canonicalJson, validateManifest } from './validation';

export async function state(env: Env, id: string) {
  const p = await publication(env, id);
  const rows = await files(env, id);
  return json({ publicationId: id, status: p.status, revision: p.revision, missing: rows.filter((f) => !f.uploaded_at).map((f) => f.path) });
}

export async function declare(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ manifest?: unknown; queueItemId?: string; leaseToken?: string }>(req, 512_000);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(422, 'invalid_manifest', 'Objet de déclaration attendu.');
  const m = validateManifest(body.manifest);
  if ((body.queueItemId == null) !== (body.leaseToken == null) || (body.queueItemId != null && (typeof body.queueItemId !== 'string' || typeof body.leaseToken !== 'string' || body.queueItemId.length > 100 || body.leaseToken.length > 256))) {
    throw new HttpError(422, 'invalid_lease', 'Demande et jeton de bail requis ensemble.');
  }
  const lease = { queue_item_id: body.queueItemId ?? null, lease_token: body.leaseToken ?? null };
  await assertLease(env, lease);
  if (lease.queue_item_id) {
    const q = await env.DB.prepare('SELECT kind,ref FROM prepare_queue WHERE id=?').bind(lease.queue_item_id).first<{ kind: string; ref: string }>();
    if (!q || m.content.sourceRef !== `${q.kind}:${q.ref}`) throw new HttpError(422,'queue_source_mismatch','La publication ne correspond pas à la demande.');
  }
  const serialized = canonicalJson(m);
  const revision = await sha256Hex(serialized);
  const existing = await env.DB.prepare('SELECT * FROM publications WHERE content_id=? AND revision=?').bind(m.content.id, revision).first<Publication>();
  if (existing) {
    if (existing.queue_item_id !== lease.queue_item_id) throw new HttpError(409, 'lease_mismatch', 'Publication liée à une autre demande.');
    if (!['ready', 'uploading'].includes(existing.status)) throw new HttpError(409, 'publication_closed', 'Cette révision est fermée.');
    if (existing.lease_token !== lease.lease_token) {
      // Le nouveau propriétaire peut reprendre les fichiers d'une publication interrompue.
      const rebound = await env.DB.prepare(`UPDATE publications SET lease_token=?,updated_at=? WHERE id=? AND status='uploading'
        AND EXISTS (SELECT 1 FROM prepare_queue WHERE id=? AND status='leased' AND lease_token=? AND lease_expires_at>?)`)
        .bind(lease.lease_token,new Date().toISOString(),existing.id,lease.queue_item_id,lease.lease_token,new Date().toISOString()).run();
      if (!rebound.meta.changes) throw new HttpError(409,'lease_lost','Impossible de reprendre cette publication.');
    }
    if (existing.status === 'uploading') await env.DB.prepare('UPDATE publications SET updated_at=? WHERE id=?').bind(new Date().toISOString(), existing.id).run();
    await env.FILES.put(existing.manifest_r2_key, serialized, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
    return state(env, existing.id);
  }
  await assertSource(env, m);
  await assertRetained(env, m, await current(env, m.content.id));
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const manifestKey = `manifests/${m.content.id}/${revision}.json`;
  // Écriture immuable : deux déclarations simultanées partagent ce même manifeste.
  const c = m.content;
  const batch = [
    env.DB.prepare(`INSERT OR IGNORE INTO contents (id,title,original_language,source_type,source_ref,source_url,category,editorial,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(c.id,c.title,c.originalLanguage,c.sourceType,c.sourceRef ?? null,c.sourceUrl ?? null,c.category ?? null,c.editorial ?? 'news',now,now),
    env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,queue_item_id,lease_token,created_at,updated_at)
      SELECT ?,?,?,COALESCE(MAX(seq),0)+1,'uploading',?,?,?,?,? FROM publications WHERE content_id=?`)
      .bind(id,c.id,revision,manifestKey,lease.queue_item_id,lease.lease_token,now,now,c.id),
  ];
  for (const [path, f] of Object.entries(m.files)) {
    const key = `blobs/${f.sha256}`;
    const stored = await env.FILES.head(key);
    if (stored && stored.size !== f.size) throw new HttpError(422, 'size_mismatch', 'Taille incompatible avec une empreinte existante.');
    batch.push(env.DB.prepare(`INSERT INTO publication_files (publication_id,path,sha256,size,content_type,r2_key,uploaded_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(id,path,f.sha256,f.size,f.contentType,key,stored ? now : null));
  }
  try { await env.DB.batch(batch); }
  catch (e) {
    const concurrent = await env.DB.prepare('SELECT id FROM publications WHERE content_id=? AND revision=?').bind(c.id,revision).first<{ id: string }>();
    if (concurrent) {
      const same = await publication(env,concurrent.id);
      await env.FILES.put(same.manifest_r2_key,serialized,{ onlyIf:{ etagDoesNotMatch:'*' },httpMetadata:{ contentType:'application/json' } });
      return state(env,concurrent.id);
    }
    if (String(e).includes('blob_deleting')) throw new HttpError(409, 'blob_deleting', 'Nettoyage en cours, réessayer la déclaration.');
    throw e;
  }
  await env.FILES.put(manifestKey, serialized, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
  return state(env, id);
}
