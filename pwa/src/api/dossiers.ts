import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { QueueItem } from '../queue/types';
import { usePreparationLive } from '../notifications/PreparationEventsProvider';

export type DossierSourceType = 'episode' | 'content' | 'reflection' | 'article';
export interface DossierRef { type: DossierSourceType; id: string }
export interface Dossier { id: string; title: string; version: number; sources: (DossierRef & { title?: string | null })[]; createdAt: string; updatedAt: string }
export interface DossierRun { id: string; version: number; createdAt: string; status: QueueItem['status'] | null; contentId: string | null }
export interface DossierCandidate { type: DossierSourceType; id: string; title: string; label: string; date: string }
export interface DossierOptions { coverage: 'condensed' | 'essentials'; level: 'A2' | 'B1' | 'B2' | 'C1' | 'original'; style: 'narration' | 'dialogue'; targetMinutes: number }

export const MIN_SOURCES = 2;
export const MAX_SOURCES = 6;

export function useDossiers() {
  return useQuery({ queryKey: ['dossiers'], queryFn: () => api<{ dossiers: Dossier[] }>('/api/dossiers') });
}
export function useDossier(id: string | null) {
  const live = usePreparationLive();
  return useQuery({ queryKey: ['dossier', id], enabled: !!id, refetchInterval: live ? false : 300_000,
    queryFn: () => api<{ dossier: Dossier; runs: DossierRun[] }>(`/api/dossiers/${id}`) });
}
export function useDossierCandidates(search: string) {
  return useQuery({ queryKey: ['dossier-sources', search], placeholderData: (previous) => previous,
    queryFn: () => api<{ sources: DossierCandidate[]; nextOffset: number | null }>(`/api/dossier-sources?q=${encodeURIComponent(search)}`) });
}

export function useDossierMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['dossiers'] });
    void qc.invalidateQueries({ queryKey: ['dossier'] });
    void qc.invalidateQueries({ queryKey: ['queue'] });
  };
  return {
    create: useMutation({ onSuccess: refresh,
      mutationFn: (body: { title: string; sources: DossierRef[] }) => api<{ dossier: Dossier }>('/api/dossiers', { method: 'POST', body }) }),
    update: useMutation({ onSuccess: refresh,
      mutationFn: ({ id, ...body }: { id: string; title: string; version: number; sources: DossierRef[] }) =>
        api<{ dossier: Dossier }>(`/api/dossiers/${id}`, { method: 'PATCH', body }) }),
    prepare: useMutation({ onSuccess: refresh,
      mutationFn: ({ id, options }: { id: string; options: DossierOptions }) =>
        api<{ item: QueueItem }>(`/api/dossiers/${id}/prepare`, { method: 'POST', body: options }) }),
  };
}
