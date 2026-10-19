import type { Env } from '../env';
import { manifest } from '../publications/store';
import type { Manifest, Publication, Segment, Segments } from '../publications/types';
import { pageSql, type Page } from './pagination';

export interface ExportAudio {
  origin: string; source: string; durationMs: number; timingSource: string;
  sha256: string | null; sizeBytes: number | null; streamUrl: string | null; playbackPath: string | null;
}
export interface ExportVariant {
  key: string; kind: string; language: string; cefrLevel: string | null; style: string | null;
  derivedFrom: string | null; coverage: string; timingStatus: string | null;
  condensation: Manifest['variants'][number]['condensation'] | null; generation: Record<string, unknown>; evaluation: Record<string, unknown>;
  keyVocab: string[]; audio: ExportAudio | null; segments: Segment[] | null; segmentsError: string | null;
}
export interface ExportContent {
  id: string; title: string; originalLanguage: string; sourceType: string; sourceRef: string | null;
  sourceUrl: string | null; category: string | null; editorial: string; createdAt: string; updatedAt: string;
  rights: string | null; sources: Manifest['content']['sources'] | null; publication: { id: string; revision: string; seq: number; publishedAt: string };
  variants: ExportVariant[]; files: { path: string; sha256: string; size: number; contentType: string }[];
  error: string | null;
}

/**
 * Contenus visibles et leur publication courante : métadonnées, variantes avec leurs segments complets
 * (texte, traduction, provenance), et fichiers avec empreinte et taille. Un manifeste ou des segments
 * indisponibles n'interrompent pas l'export : le contenu est exporté avec une erreur explicite.
 */
export async function loadContents(env: Env, page?: Page): Promise<ExportContent[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.title, c.original_language, c.source_type, c.source_ref, c.source_url, c.category, c.editorial,
            c.created_at, c.updated_at, p.id AS publication_id, p.revision, p.seq, p.manifest_r2_key, p.created_at AS published_at
       FROM contents c JOIN publications p ON p.id = c.current_publication_id
      WHERE c.deleted_at IS NULL AND p.status = 'ready' ORDER BY c.created_at, c.id ${pageSql(page, 1)}`,
  ).all<{
    id: string; title: string; original_language: string; source_type: string; source_ref: string | null; source_url: string | null;
    category: string | null; editorial: string; created_at: string; updated_at: string;
    publication_id: string; revision: string; seq: number; manifest_r2_key: string; published_at: string;
  }>();
  const timing = new Map<string, string>();
  for (const v of (await env.DB.prepare(`SELECT publication_id, variant_key, timing_status FROM variants WHERE publication_id IN (SELECT c.current_publication_id FROM contents c JOIN publications p ON p.id=c.current_publication_id WHERE c.deleted_at IS NULL AND p.status='ready' ORDER BY c.created_at, c.id ${pageSql(page, 1)})`)
    .all<{ publication_id: string; variant_key: string; timing_status: string }>()).results) {
    timing.set(`${v.publication_id}/${v.variant_key}`, v.timing_status);
  }
  const contents: ExportContent[] = [];
  for (const c of results) {
    const entry: ExportContent = {
      id: c.id, title: c.title, originalLanguage: c.original_language, sourceType: c.source_type, sourceRef: c.source_ref,
      sourceUrl: c.source_url, category: c.category, editorial: c.editorial, createdAt: c.created_at, updatedAt: c.updated_at,
      rights: null, sources: null, publication: { id: c.publication_id, revision: c.revision, seq: c.seq, publishedAt: c.published_at },
      variants: [], files: [], error: null,
    };
    contents.push(entry);
    let m: Manifest;
    try {
      const p: Publication = {
        id: c.publication_id, content_id: c.id, revision: c.revision, seq: c.seq, status: 'ready',
        manifest_r2_key: c.manifest_r2_key, queue_item_id: null, lease_token: null, commit_token: null,
      };
      m = await manifest(env, p);
      if (!m?.content || !m.files || !Array.isArray(m.variants)) throw new Error('invalid_manifest');
    } catch {
      entry.error = 'manifest_unavailable';
      continue;
    }
    entry.rights = m.content.rights;
    entry.sources = m.content.sources ?? null;
    entry.files = Object.entries(m.files).map(([path, f]) => ({ path, sha256: f.sha256, size: f.size, contentType: f.contentType }));
    for (const v of m.variants) {
      const audioFile = v.audio?.source === 'r2' && v.audio.file ? m.files[v.audio.file] : undefined;
      entry.variants.push({
        key: v.key, kind: v.kind, language: v.language, cefrLevel: v.cefrLevel ?? null, style: v.style ?? null,
        derivedFrom: v.derivedFrom ?? null, coverage: v.coverage ?? 'full',
        condensation: v.condensation ?? null, generation: v.generation ?? {}, evaluation: v.evaluation ?? {}, keyVocab: [],
        timingStatus: timing.get(`${c.publication_id}/${v.key}`) ?? null,
        audio: v.audio ? {
          origin: v.audio.origin, source: v.audio.source, durationMs: v.audio.durationMs, timingSource: v.audio.timingSource,
          sha256: audioFile?.sha256 ?? null, sizeBytes: audioFile?.size ?? null,
          streamUrl: v.audio.source === 'publisher_stream' ? v.audio.url ?? null : null,
          playbackPath: v.audio.source === 'r2' ? `/api/contents/${c.id}/variants/${v.key}/audio?publication=${c.publication_id}` : null,
        } : null,
        segments: null, segmentsError: null,
      });
      const variant = entry.variants[entry.variants.length - 1]!;
      const file = m.files[v.segmentsFile];
      if (!file) { variant.segmentsError = 'file_missing'; continue; }
      try {
        const obj = await env.FILES.get(`blobs/${file.sha256}`);
        if (!obj) { variant.segmentsError = 'file_missing'; continue; }
        const doc = await obj.json<Segments>();
        if (!Array.isArray(doc.segments)) throw new Error('invalid_segments');
        variant.segments = doc.segments;
        variant.keyVocab = doc.keyVocab ?? [];
      } catch {
        variant.segmentsError = 'unreadable';
      }
    }
  }
  return contents;
}

