import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { cachedSegments, isNetworkFailure, offline } from '../offline';

export type ContentSourceType = 'podcast' | 'youtube' | 'reflection' | 'dossier';
export interface LibraryFilters { type?: ContentSourceType; search?: string }
export interface PreparedContent {
  id: string; title: string; originalLanguage: string; sourceType: ContentSourceType; category: string | null;
  updatedAt: string; variantCount: number;
}
export interface ContentVariant {
  key: string;
  kind: 'source' | 'faithful_translation' | 'adaptation';
  language: string;
  cefrLevel?: string | null;
  coverage?: 'full' | 'condensed' | 'essentials';
  style?: 'narration' | 'dialogue';
  derivedFrom?: string | null;
  timingStatus: 'exact' | 'unverified' | 'none';
  segmentsUrl: string;
  audio: { source: 'r2' | 'publisher_stream'; url: string; sha256?: string; durationMs: number; timingSource: string } | null;
}
export interface ContentSegment {
  id: string; text: string; fr?: string; speaker?: string;
  startMs: number | null; endMs: number | null;
  sourceSegments?: string[];
  /** Source d'un dossier : passage d'origine et instant dans l'original quand il est connu. */
  provenance?: { sourceId: string; segmentId: string; startMs: number | null; endMs: number | null };
}
export interface ContentSegments { schemaVersion: 1; variantKey: string; segments: ContentSegment[] }
/** Source d'un dossier multisource (chantier A), telle que capturée pour l'exécution publiée. */
export interface DossierSource { id: string; type: 'episode' | 'content' | 'reflection' | 'article'; ref: string; title: string; capturedAt: string }
export interface ContentDetail { episode?: { id: string; showId: string } | null; content: { id: string; title: string; sourceType?: ContentSourceType; sources?: DossierSource[] }; publicationId: string; variants: ContentVariant[] }

export function usePreparedContents(filters: LibraryFilters = {}) {
  return useInfiniteQuery({ queryKey: ['library','prepared',filters], initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ offset: String(pageParam) });
      if (filters.type) params.set('type', filters.type);
      if (filters.search) params.set('q', filters.search);
      return api<{ contents: PreparedContent[]; total: number; nextOffset: number | null }>(`/api/library?${params}`);
    },
    getNextPageParam: (page) => page.nextOffset ?? undefined });
}
export function useContent(id: string) {
  return useQuery({ queryKey: ['content',id], queryFn: async () => {
    try { return await api<ContentDetail>(`/api/contents/${id}`); }
    catch (error) {
      // Hors ligne : l'instantané des versions téléchargées (chantier B).
      const local = isNetworkFailure(error) ? await offline.detail(id).catch(() => null) : null;
      if (local) return local;
      throw error;
    }
  } });
}
export function useContentSegments(publicationId: string, variant: ContentVariant | undefined, enabled = true) {
  return useQuery({ queryKey: ['content-segments',publicationId,variant?.key], enabled: enabled && !!variant,
    queryFn: async () => {
      // Une transcription téléchargée sert aussi en ligne : même publication, même contenu.
      const data = await cachedSegments(publicationId, variant!.key) ?? await api<ContentSegments>(variant!.segmentsUrl);
      if (data.variantKey !== variant!.key || !Array.isArray(data.segments)) throw new Error('Transcription incompatible avec cette version.');
      return data;
    }, staleTime: Infinity });
}
