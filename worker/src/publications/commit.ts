import type { Env } from '../env';
import { HttpError, json } from '../http';
import { assertLease, assertRetained, assertSource, current, files, manifest, publication } from './store';
import type { Manifest, Publication, Variant } from './types';
import { validateSegments } from './validation';
import { assertPrepared } from './preparation';

async function checkSegments(env: Env, m: Manifest, prepared: boolean) {
  async function load(v: Variant): Promise<unknown> {
    const f = m.files[v.segmentsFile]!;
    if (f.size > 5_000_000) throw new HttpError(422, 'segments_too_large', 'Segments limités à 5 Mo.');
    const object = await env.FILES.get(`blobs/${f.sha256}`);
    if (!object) throw new HttpError(409, 'missing_files', 'Segments manquants.');
    try { return await object.json(); }
    catch { throw new HttpError(422, 'invalid_segments', 'JSON de segments invalide.'); }
  }
  const source = m.variants.find((v) => v.kind === 'source')!;
  const sourceDoc = validateSegments(await load(source), source);
  const ids = new Set(sourceDoc.segments.map((s) => s.id));
  // Provenance : uniquement dans la source d'un dossier, chaque passage vers une source déclarée.
  const dossierSources = new Set((m.content.sources ?? []).map((x) => x.id));
  if (sourceDoc.segments.some((s) => m.content.sourceType === 'dossier' ? !s.provenance || !dossierSources.has(s.provenance.sourceId) : !!s.provenance)) {
    throw new HttpError(422, 'invalid_provenance', 'Provenance des passages invalide.');
  }
  for (const v of m.variants) {
    if (v.key !== source.key) {
      const doc = validateSegments(await load(v), v, ids);
      if (doc.segments.some((x) => x.provenance)) throw new HttpError(422, 'invalid_provenance', 'Provenance réservée à la source d’un dossier.');
      if (prepared && v.kind==='adaptation' && doc.segments.some((s) => !s.fr?.trim() ||
          (v.style==='narration' ? s.speaker!=='Narrator' : s.speaker!=='Host' && s.speaker!=='Guest'))) {
        throw new HttpError(422,'invalid_adaptation_segments','Traduction française et intervenants conformes au style requis.');
      }
    }
  }
}

function insertVariant(env: Env, p: Publication, m: Manifest, v: Variant, index: number) {
  const a = v.audio;
  return env.DB.prepare(`INSERT INTO variants
    (publication_id,variant_key,content_id,kind,language,cefr_level,style,coverage,condensation_json,derived_from,
     segments_path,audio_source,audio_path,audio_url,audio_sha256,audio_origin,duration_ms,timing_source,timing_status,evaluation_json,generation_json,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    p.id,v.key,p.content_id,v.kind,v.language,v.cefrLevel ?? null,v.style ?? null,v.coverage ?? 'full',
    v.condensation ? JSON.stringify(v.condensation) : null,v.derivedFrom ?? null,v.segmentsFile,a?.source ?? null,
    a?.file ?? null,a?.url ?? null,a?.file ? m.files[a.file]!.sha256 : null,a?.origin ?? null,a?.durationMs ?? null,
    a?.timingSource ?? 'none',!a || a.timingSource === 'none' ? 'none' : a.origin === 'original' ? 'unverified' : 'exact',
    JSON.stringify(v.evaluation ?? {}),JSON.stringify(v.generation ?? {}),index,
  );
}

export async function commit(env: Env, id: string, requestToken?: string | null): Promise<Response> {
  const p = await publication(env, id);
  await assertLease(env, p, requestToken);
  const token = crypto.randomUUID(), now = new Date().toISOString();
  const lock = await env.DB.prepare("UPDATE publications SET status='committing',commit_token=?,updated_at=? WHERE id=? AND status='uploading'").bind(token,now,id).run();
  if (!lock.meta.changes) throw new HttpError(409, 'commit_conflict', 'Un commit est déjà en cours ou terminé.');
  try {
    const rows = await files(env,id), missing: string[] = [];
    for (const f of rows) {
      const object = await env.FILES.head(f.r2_key);
      if (!f.uploaded_at || !object || object.size !== f.size) missing.push(f.path);
    }
    if (missing.length) {
      for (const path of missing) await env.DB.prepare('UPDATE publication_files SET uploaded_at=NULL WHERE publication_id=? AND path=?').bind(id,path).run();
      await unlock(env,id,token);
      return json({ publicationId: id, status: 'uploading', missing },409);
    }
    const m = await manifest(env,p);
    await assertPrepared(env,p,m);
    await assertSource(env,m);
    const oldId = await current(env,p.content_id);
    await assertRetained(env,m,oldId);
    await checkSegments(env,m,!!p.queue_item_id);
    const c = m.content;
    const batch = [
      // Cette assertion est évaluée dans la transaction qui effectue la bascule.
      env.DB.prepare(`INSERT INTO publication_guards (id,valid) SELECT ?, CASE WHEN
        EXISTS (SELECT 1 FROM publications WHERE id=? AND status='committing' AND commit_token=?)
        AND (SELECT current_publication_id FROM contents WHERE id=?) IS ?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM prepare_queue WHERE id=? AND status='leased' AND lease_token=? AND lease_expires_at>?))
        THEN 1 ELSE 0 END`).bind(token,id,token,c.id,oldId,p.queue_item_id,p.queue_item_id,p.lease_token,new Date().toISOString()),
      ...m.variants.map((v,i) => insertVariant(env,p,m,v,i)),
      env.DB.prepare(`UPDATE contents SET deleted_at=NULL,current_publication_id=?,title=?,original_language=?,source_type=?,source_ref=?,source_url=?,category=?,editorial=?,updated_at=?
        WHERE id=? AND (current_publication_id IS NULL OR (SELECT seq FROM publications WHERE id=current_publication_id) < ?)`)
        .bind(id,c.title,c.originalLanguage,c.sourceType,c.sourceRef ?? null,c.sourceUrl ?? null,c.category ?? null,c.editorial ?? 'news',now,c.id,p.seq),
      env.DB.prepare(`UPDATE publications SET status='superseded',superseded_at=?,updated_at=? WHERE content_id=? AND status='ready'
        AND id<>(SELECT current_publication_id FROM contents WHERE id=?)`).bind(now,now,c.id,c.id),
      env.DB.prepare(`UPDATE publications SET status=CASE WHEN id=(SELECT current_publication_id FROM contents WHERE id=?) THEN 'ready' ELSE 'superseded' END,
        superseded_at=CASE WHEN id=(SELECT current_publication_id FROM contents WHERE id=?) THEN NULL ELSE ? END,updated_at=?,commit_token=NULL WHERE id=?`).bind(c.id,c.id,now,now,id),
    ];
    const visible = 'EXISTS (SELECT 1 FROM contents WHERE id=? AND current_publication_id=?)';
    if (c.sourceType === 'podcast') batch.push(env.DB.prepare(`UPDATE episodes SET content_id=? WHERE id=? AND ${visible}`).bind(c.id,c.sourceRef!.slice(8),c.id,id));
    if (c.sourceType === 'youtube' && c.sourceRef) batch.push(env.DB.prepare(`UPDATE episodes SET content_id=? WHERE video_id=? AND ${visible}`).bind(c.id,c.sourceRef!.slice(8),c.id,id));
    if (c.sourceType === 'reflection') batch.push(env.DB.prepare(`UPDATE reflections SET english_content_id=? WHERE id=? AND ${visible}`).bind(c.id,c.sourceRef!.slice(11),c.id,id));
    if (p.queue_item_id) batch.push(env.DB.prepare("UPDATE prepare_queue SET status='done',content_id=?,updated_at=? WHERE id=?").bind(c.id,now,p.queue_item_id));
    batch.push(env.DB.prepare('DELETE FROM publication_guards WHERE id=?').bind(token));
    try { await env.DB.batch(batch); }
    catch (e) {
      if (String(e).includes('CHECK constraint')) {
        await assertLease(env,p);
        throw new HttpError(409, 'commit_conflict', 'La publication courante a changé, réessayer le commit.');
      }
      throw e;
    }
    return json({ publicationId: id, status: (await publication(env,id)).status });
  } catch (e) { await unlock(env,id,token); throw e; }
}
async function unlock(env: Env,id: string,token: string) {
  await env.DB.prepare("UPDATE publications SET status='uploading',commit_token=NULL WHERE id=? AND status='committing' AND commit_token=?").bind(id,token).run();
}
