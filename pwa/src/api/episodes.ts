import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type Category = 'tech' | 'science' | 'economy' | 'news' | 'football' | 'stories' | 'humour' | 'study';
export type EpisodeState = 'new' | 'seen' | 'saved' | 'dismissed';

export const CATEGORY_LABELS: Record<Category, string> = {
  tech: 'Tech',
  science: 'Sciences',
  economy: 'Économie',
  news: 'Actualité',
  football: 'Football',
  stories: 'Histoires',
  humour: 'Humour et anecdotes',
  study: 'Apprendre l’anglais',
};

export interface Episode {
  sourceType?: 'podcast' | 'youtube';
  videoId?: string | null;
  id: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  audioUrl: string;
  imageUrl: string | null;
  transcriptType: 'srt' | 'vtt' | null;
  state: EpisodeState;
  contentId: string | null;
  showId: string;
  showTitle: string;
  language: 'fr' | 'en';
  category: Category;
  /** Progression de l'audio original (null si jamais écouté ou si l'audio a changé). */
  progressMs: number | null;
  progressDurationMs: number | null;
  progressCompleted: 0 | 1 | null;
}

export interface ExplorerFilters {
  sourceType?: 'podcast' | 'youtube';
  category?: Category;
  lang?: 'fr' | 'en';
  state?: EpisodeState;
  show?: string;
}

function query(filters: ExplorerFilters, cursor?: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
  if (cursor) p.set('cursor', cursor);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useExplorer(filters: ExplorerFilters, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: ['explorer', filters],
    queryFn: ({ pageParam }) => api<{ episodes: Episode[]; nextCursor: string | null }>(`/api/explorer${query(filters, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}

export function useEpisode(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['episode', id],
    queryFn: async () => (await api<{ episode: Episode }>(`/api/episodes/${id}`)).episode,
    enabled: !!id,
    // L'épisode est souvent déjà dans le fil : le détail s'affiche aussitôt (et la pochette peut « voler » de la carte au détail),
    // puis la version complète remplace ces données.
    placeholderData: () => {
      for (const [, data] of qc.getQueriesData<{ pages: { episodes: Episode[] }[] }>({ queryKey: ['explorer'] })) {
        const found = data?.pages?.flatMap((p) => p.episodes).find((e) => e.id === id);
        if (found) return found;
      }
      return undefined;
    },
  });
}

export function useSetEpisodeState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: EpisodeState }) =>
      api<{ id: string; state: EpisodeState }>(`/api/episodes/${id}/state`, { method: 'POST', body: { state } }),
    onSuccess: ({ id, state }) => {
      qc.setQueryData<Episode>(['episode', id], (e) => (e ? { ...e, state } : e));
      void qc.invalidateQueries({ queryKey: ['explorer'] });
    },
  });
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** « il y a 3 h », « hier », « 12 oct. » */
export function formatWhen(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const diff = now - Date.parse(iso);
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'à l’instant';
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return 'hier';
  return dateFmt.format(new Date(iso));
}

export function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
