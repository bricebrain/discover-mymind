import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Category } from './episodes';
import { levelSuggestionKey } from '../levels/keys';
import type { LevelSuggestion } from '../levels/types';

/** Chaîne YouTube suivie : Discover ne suit plus de podcasts depuis le 21 octobre 2026. */
export interface Show {
  sourceType: 'youtube';
  channelId: string | null;
  id: string;
  title: string;
  publisher: string | null;
  feedUrl: string;
  language: 'fr' | 'en';
  category: Category;
  imageUrl: string | null;
  titleFilter: string[] | null;
  enabled: boolean;
  /** Préparation automatique de la dernière vidéo : formule et niveau. */
  autoPrepare: boolean;
  autoPreset: AutoPreset;
  autoLevel: AutoLevel;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  episodeCount: number;
}

export type AutoPreset = 'essentials4' | 'condensed8';
export type AutoLevel = 'A2' | 'B1' | 'B2' | 'C1' | 'original';
export const AUTO_PRESETS: Record<AutoPreset, { label: string; cost: string }> = {
  essentials4: { label: 'L’essentiel · 4 min', cost: '≈ 0,09 USD de voix Deepgram par vidéo' },
  condensed8: { label: 'Condensé · 8 min', cost: '≈ 0,19 USD de voix Deepgram par vidéo' },
};

export interface ShowPreview {
  sourceType: 'youtube';
  channelId: string;
  feedUrl: string;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
  language: 'fr' | 'en' | null;
  medianMinutes: number | null;
  episodesPerWeek: number | null;
  latest: { title: string; publishedAt: string | null; durationSec: number | null }[];
}

export interface NewShow {
  sourceType: 'youtube';
  channelId: string;
  feedUrl: string;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
  language: 'fr' | 'en';
  category: Category;
  titleFilter: string[] | null;
}

export function useShows() {
  return useQuery({ queryKey: ['shows'], queryFn: () => api<{ shows: Show[]; max: number; autoPrepareEnabled: boolean }>('/api/shows') });
}

export function useLevelSuggestion(showId: string) {
  return useQuery({
    queryKey: levelSuggestionKey(showId),
    queryFn: () => api<{ levelSuggestion: LevelSuggestion }>(`/api/shows/${encodeURIComponent(showId)}/level-suggestion`),
  });
}

export function useResolveShow() {
  return useMutation({ mutationFn: (input: string) => api<{ kind: 'preview'; preview: ShowPreview }>('/api/shows/resolve', { method: 'POST', body: { input } }) });
}

export function useCreateShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: NewShow) => api<{ show: Show }>('/api/shows', { method: 'POST', body: s }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shows'] });
      void qc.invalidateQueries({ queryKey: ['explorer'] });
    },
  });
}

export function useUpdateShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; enabled?: boolean; category?: Category; titleFilter?: string[];
      autoPrepare?: boolean; autoPreset?: AutoPreset; autoLevel?: AutoLevel }) =>
      api<{ show: Show }>(`/api/shows/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: levelSuggestionKey(id) });
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

/** Interrupteur général des préparations automatiques. */
export function useAutoPrepareSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api<{ enabled: boolean }>('/api/settings/auto-prepare', { method: 'PUT', body: { enabled } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}
