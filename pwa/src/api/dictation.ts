import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export type DictationCategory = 'reduced_form' | 'linking' | 'unknown_word' | 'number' | 'proper_noun' | 'grammar_word' | 'spelling' | 'missed';
export const CATEGORY_LABELS: Record<DictationCategory, string> = {
  reduced_form: 'Forme réduite', linking: 'Mots enchaînés', unknown_word: 'Mot inconnu', number: 'Nombre',
  proper_noun: 'Nom propre', grammar_word: 'Petit mot grammatical', spelling: 'Orthographe', missed: 'Passage décroché',
};
export interface DictationToken { expected?: string; typed?: string; status: 'ok' | 'missing' | 'wrong' | 'extra' }
export interface DictationError { expected: string; heard: string; category: DictationCategory; explanation: string | null }
export interface DictationResult {
  id: string; segmentId: string; expected: string; tokens: DictationToken[]; expectedWords: number; correctWords: number;
  accuracy: number; errors: DictationError[]; tip: string | null;
}
export interface DictationProgress {
  understoodThreshold: number;
  weeks: { week: string; sentences: number; understood: number; understoodShare: number; wordAccuracy: number }[];
  categories: { category: DictationCategory; count: number }[];
  recent: { createdAt: string; contentId: string; title: string | null; expected: string; typed: string; accuracy: number }[];
}

export const submitDictation = (contentId: string, variantKey: string, body: { publicationId: string; segmentId: string; typed: string }) =>
  api<DictationResult>(`/api/contents/${encodeURIComponent(contentId)}/variants/${encodeURIComponent(variantKey)}/dictation`, { method: 'POST', body });

export const DICTATION_PROGRESS_KEY = ['dictation-progress'] as const;
export function useDictationProgress() {
  return useQuery({ queryKey: DICTATION_PROGRESS_KEY, queryFn: () => api<DictationProgress>('/api/dictation/progress'), staleTime: 60_000 });
}
