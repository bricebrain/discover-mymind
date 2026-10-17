import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface PreparedContent {
  id: string; title: string; originalLanguage: string; sourceType: string; category: string | null;
  updatedAt: string; variantCount: number;
}
export interface ContentVariant {
  key: string; kind: string; language: string; cefrLevel?: string | null; coverage?: string;
  segmentsUrl: string; audio: { url: string; sha256?: string; durationMs: number } | null;
}
interface Detail { content: { id: string; title: string }; publicationId: string; variants: ContentVariant[] }
export function usePreparedContents() {
  return useInfiniteQuery({ queryKey: ['library','prepared'], initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ contents: PreparedContent[]; total: number; nextOffset: number | null }>(`/api/library?offset=${pageParam}`),
    getNextPageParam: (page) => page.nextOffset ?? undefined });
}
export function useContent(id: string) {
  return useQuery({ queryKey: ['content',id], queryFn: () => api<Detail>(`/api/contents/${id}`) });
}
