import type { Env } from '../env';
import { HttpError } from '../http';
import type { PrepareOptions } from '../queue/options';
import type { Manifest,Publication } from './types';

/** Une demande n'est achevée que lorsque la version demandée est publiable et possède son audio. */
export async function assertPrepared(env: Env,p: Publication,m: Manifest) {
  if (!p.queue_item_id) return;
  const row = await env.DB.prepare('SELECT options_json FROM prepare_queue WHERE id=?').bind(p.queue_item_id).first<{options_json:string}>();
  if (!row) throw new HttpError(409,'lease_lost','Demande introuvable.');
  const options = JSON.parse(row.options_json) as PrepareOptions;
  const adapted = m.variants.find((v) => v.kind==='adaptation' && v.language==='en' && v.coverage===options.coverage &&
    (v.cefrLevel ?? 'original')===options.level && v.style===options.style &&
    (options.coverage==='full' || v.condensation?.targetMinutes===options.targetMinutes));
  if (!adapted || adapted.audio?.source!=='r2' || adapted.audio.timingSource!=='kokoro') {
    throw new HttpError(422,'prepared_variant_missing','La version demandée et son audio Kokoro sont requis.');
  }
  const e = adapted.evaluation as Record<string,unknown> | undefined;
  if (!e || (e.verdict!=='ok' && !(e.verdict==='review' && e.acceptedByUser===true && typeof e.reviewedAt==='string' && Number.isFinite(Date.parse(e.reviewedAt))))) {
    throw new HttpError(422,'review_required','Cette version doit être relue et acceptée dans l’Atelier.');
  }
  if (options.faithful && !m.variants.some((v) => v.kind==='faithful_translation' && v.language==='en' && v.audio?.source==='r2')) {
    throw new HttpError(422,'faithful_variant_missing','La traduction fidèle demandée est absente.');
  }
  if (options.keepOriginalCopy && !m.variants.some((v) => v.kind==='source' && v.audio?.source==='r2')) {
    throw new HttpError(422,'original_copy_missing','La copie originale demandée est absente.');
  }
}
