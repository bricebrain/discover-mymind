import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface PreparedContent {
  id: string; title: string; originalLanguage: string; sourceType: string; category: string | null;
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
}
export interface ContentSegments { schemaVersion: 1; variantKey: string; segments: ContentSegment[] }
export interface ContentDetail { content: { id: string; title: string }; publicationId: string; variants: ContentVariant[] }

export function usePreparedContents() {
  return useInfiniteQuery({ queryKey: ['library','prepared'], initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ contents: PreparedContent[]; total: number; nextOffset: number | null }>(`/api/library?offset=${pageParam}`),
    getNextPageParam: (page) => page.nextOffset ?? undefined });
}
export function useContent(id: string) {
  return useQuery({ queryKey: ['content',id], queryFn: () => api<ContentDetail>(`/api/contents/${id}`) });
}
export function useContentSegments(publicationId: string, variant: ContentVariant | undefined, enabled = true) {
  return useQuery({ queryKey: ['content-segments',publicationId,variant?.key], enabled: enabled && !!variant,
    queryFn: async () => {
      const data = await api<ContentSegments>(variant!.segmentsUrl);
      if (data.variantKey !== variant!.key || !Array.isArray(data.segments)) throw new Error('Transcription incompatible avec cette version.');
      return data;
    }, staleTime: Infinity });
}
