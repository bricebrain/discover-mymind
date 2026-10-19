import { api } from '../api/client';
import type { LevelFeedbackInput, LevelFeedbackResponse } from './types';

export function sendLevelFeedback(contentId: string, variantKey: string, input: LevelFeedbackInput) {
  return api<LevelFeedbackResponse>(
    `/api/contents/${encodeURIComponent(contentId)}/variants/${encodeURIComponent(variantKey)}/feedback`,
    { method: 'POST', body: { publicationId: input.publicationId, rating: input.rating } },
  );
}
