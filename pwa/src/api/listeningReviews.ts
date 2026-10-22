import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface ListeningReview {
  contentId: string; publicationId: string; variantKey: string; title: string; step: number; dueAt: string;
  passage: { fromSegment: string; toSegment: string; startMs: number; endMs: number; reason?: string };
}
export const LISTENING_REVIEWS_KEY = ['listening-reviews'] as const;
export function useListeningReviews() {
  return useQuery({ queryKey: LISTENING_REVIEWS_KEY, queryFn: () => api<{ reviews: ListeningReview[] }>('/api/listening-reviews/due') });
}
export function useCompleteListeningReview(contentId: string, publicationId: string, variantKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ step: number; dueAt: string; accuracy?: number; alreadyDone: boolean }>(
      `/api/listening-reviews/${encodeURIComponent(contentId)}/done`, { method: 'POST', body: { publicationId, variantKey } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: LISTENING_REVIEWS_KEY }),
  });
}
