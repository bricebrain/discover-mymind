import { HttpError } from '../http';
import { parseSafeUrl } from '../security/safeUrl';
import manifestSchema from './manifest.generated.js';
import segmentsSchema from './segments.generated.js';
import type { Manifest, Segments, Variant } from './types';

export function reject(code: string, message = code): never { throw new HttpError(422, code, message); }
export function validPath(path: string): boolean {
  return path.length <= 180 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/.test(path)
    && !path.split('/').some((p) => p === '.' || p === '..');
}
const baseLanguage = (language: string) => language.split('-')[0];
function safeUrl(url: string, allowHttp = false) {
  try { parseSafeUrl(url,{allowHttp}); } catch { reject('unsafe_url'); }
}

export interface ValidationContext { currentVariants?: string[]; episodeAudioUrl?: string }
export function validateManifest(input: unknown, context: ValidationContext = {}): Manifest {
  if (!manifestSchema(input)) {
    const issue = manifestSchema.errors?.[0];
    reject('invalid_manifest', `Manifeste invalide : ${issue?.instancePath ?? '/'} ${issue?.message ?? ''}`);
  }
  const m = input as Manifest;
  const sources = m.variants.filter((v) => v.kind === 'source');
  const source = sources[0];
  if (sources.length !== 1 || !source || source.language !== m.content.originalLanguage || source.cefrLevel != null || source.derivedFrom != null) reject('invalid_source');
  const keys = m.variants.map((v) => v.key);
  if (new Set(keys).size !== keys.length) reject('duplicate_variant');
  if (m.content.sourceUrl) safeUrl(m.content.sourceUrl,m.content.sourceType==='podcast');
  if (m.content.sourceType === 'podcast' && !/^episode:[0-9a-f]{20}$/.test(m.content.sourceRef ?? '')) reject('invalid_source_ref');
  if (m.content.sourceType === 'reflection' && !/^reflection:[0-9a-f-]{36}$/.test(m.content.sourceRef ?? '')) reject('invalid_source_ref');
  if (m.content.sourceType === 'youtube' && m.content.sourceRef != null && !/^youtube:[A-Za-z0-9_-]{11}$/.test(m.content.sourceRef)) reject('invalid_source_ref');
  if (Object.values(m.files).reduce((total, f) => total + f.size, 0) > 300_000_000) reject('publication_too_large');
  const used = new Set<string>();
  for (const v of m.variants) {
    if (v.kind === 'faithful_translation' && (v.derivedFrom !== source.key || baseLanguage(v.language) === baseLanguage(source.language) || v.cefrLevel != null)) reject('invalid_translation');
    if (v.kind === 'adaptation' && (!v.style || baseLanguage(v.language) !== 'en' || !v.derivedFrom || !keys.includes(v.derivedFrom) || v.derivedFrom === v.key)) reject('invalid_adaptation');
    const visited = new Set([v.key]);
    let parent = v.derivedFrom;
    while (parent) {
      if (visited.has(parent)) reject('cyclic_derivation');
      visited.add(parent); parent = m.variants.find((item) => item.key === parent)?.derivedFrom;
    }
    if ((v.coverage ?? 'full') !== 'full' && (v.kind !== 'adaptation' || !v.condensation)) reject('invalid_coverage');
    if ((v.coverage ?? 'full') === 'full' && v.condensation) reject('invalid_coverage');
    if (!validPath(v.segmentsFile) || m.files[v.segmentsFile]?.contentType !== 'application/json') reject('invalid_files');
    if (m.files[v.segmentsFile]!.size > 5_000_000) reject('segments_too_large');
    used.add(v.segmentsFile);
    if (v.audio?.source === 'r2') {
      if (!v.audio.file || !validPath(v.audio.file) || m.files[v.audio.file]?.contentType !== 'audio/mpeg') reject('invalid_files');
      used.add(v.audio.file);
    }
    if (v.audio?.source === 'publisher_stream') {
      safeUrl(v.audio.url!,m.content.sourceType==='podcast');
      if (m.content.sourceType !== 'podcast' || v.kind !== 'source' || v.audio.origin !== 'original') reject('invalid_stream');
    }
  }
  if (Object.keys(m.files).some((p) => !validPath(p) || !used.has(p))) reject('invalid_files');
  const sizes = new Map<string, number>();
  for (const f of Object.values(m.files)) {
    if (sizes.has(f.sha256) && sizes.get(f.sha256) !== f.size) reject('invalid_files');
    sizes.set(f.sha256, f.size);
  }
  if (m.removeVariants?.some((key) => keys.includes(key))) reject('invalid_removals');
  validateContext(m,context);
  return m;
}

export function validateContext(m: Manifest, context: ValidationContext) {
  if (context.currentVariants?.some((key) => !m.variants.some((v) => v.key === key) && !m.removeVariants?.includes(key))) reject('variant_dropped');
  if (context.episodeAudioUrl && m.variants.some((v) => v.audio?.source === 'publisher_stream' && v.audio.url !== context.episodeAudioUrl)) reject('stream_mismatch');
}

export function validateSegments(input: unknown, variant: Variant, sourceIds?: Set<string>): Segments {
  if (!segmentsSchema(input)) reject('invalid_segments');
  const doc = input as Segments;
  if (doc.variantKey !== variant.key || new Set(doc.segments.map((s) => s.id)).size !== doc.segments.length) reject('invalid_segments');
  const timed = variant.audio && variant.audio.timingSource !== 'none';
  let lastStart = -1, lastEnd = -1;
  for (const s of doc.segments) {
    if (timed) {
      if (s.startMs === null || s.endMs === null || s.startMs <= lastStart || s.endMs <= lastEnd || s.endMs <= s.startMs || s.endMs > variant.audio!.durationMs) reject('invalid_timing');
      lastStart = s.startMs; lastEnd = s.endMs;
    } else if (s.startMs !== null || s.endMs !== null) reject('invalid_timing');
    if ((variant.coverage ?? 'full') !== 'full' && !s.sourceSegments?.length) reject('missing_source_segments');
    if (s.sourceSegments?.some((id) => !sourceIds?.has(id))) reject('invalid_source_segments');
  }
  return doc;
}

/** Tri récursif des clés ; valeurs et ordre des tableaux conservés. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
  return JSON.stringify(value);
}
