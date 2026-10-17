import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Category } from './episodes';

export interface Show {
  id: string;
  title: string;
  publisher: string | null;
  feedUrl: string;
  language: 'fr' | 'en';
  category: Category;
  imageUrl: string | null;
  titleFilter: string[] | null;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  episodeCount: number;
}

export interface Candidate {
  appleId: number;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
  feedUrl: string;
}

export interface ShowPreview {
  feedUrl: string;
  title: string;
  publisher: string | null;
  appleId: number | null;
  imageUrl: string | null;
  language: 'fr' | 'en' | null;
  medianMinutes: number | null;
  episodesPerWeek: number | null;
  hasTranscripts: boolean;
  latest: { title: string; publishedAt: string | null; durationSec: number | null }[];
}

export type ResolveResult = { kind: 'candidates'; candidates: Candidate[] } | { kind: 'preview'; preview: ShowPreview };

export interface NewShow {
  feedUrl: string;
  title: string;
  publisher: string | null;
  appleId: number | null;
  imageUrl: string | null;
  language: 'fr' | 'en';
  category: Category;
  titleFilter: string[] | null;
}

export function useShows() {
  return useQuery({ queryKey: ['shows'], queryFn: () => api<{ shows: Show[]; max: number }>('/api/shows') });
}

export function useResolveShow() {
  return useMutation({ mutationFn: (input: string) => api<ResolveResult>('/api/shows/resolve', { method: 'POST', body: { input } }) });
}

export function usePreviewShow() {
  return useMutation({
    mutationFn: (c: Candidate) => api<{ preview: ShowPreview }>('/api/shows/preview', { method: 'POST', body: c }),
  });
}

export function useCreateShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: NewShow) => api<{ show: Show }>('/api/shows', { method: 'POST', body: s }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function useUpdateShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; enabled?: boolean; category?: Category; titleFilter?: string[] }) =>
      api<{ show: Show }>(`/api/shows/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shows'] });
      void qc.invalidateQueries({ queryKey: ['explorer'] });
    },
  });
}

export function useDeleteShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/shows/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shows'] });
      void qc.invalidateQueries({ queryKey: ['explorer'] });
    },
  });
}
