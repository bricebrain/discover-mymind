import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sendLevelFeedback } from './api';
import { levelFeedbackKey, levelSuggestionKey } from './keys';
import type { LevelFeedback, LevelFeedbackInput } from './types';

/** Retour connu dans cette session : l'API ne propose pas de GET de l'avis enregistré.
 * Le consommateur vérifie feedback.publicationId avant de préselectionner un avis.
 */
export function useLevelFeedback(contentId: string, variantKey: string) {
  const qc = useQueryClient();
  const current = useQuery<LevelFeedback | null>({
    queryKey: levelFeedbackKey(contentId, variantKey), queryFn: skipToken,
    initialData: null, staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (input: LevelFeedbackInput) => sendLevelFeedback(contentId, variantKey, input),
    onMutate: () => ({ contentId, variantKey }),
    onSuccess: async ({ feedback, levelSuggestion }, _input, target) => {
      qc.setQueryData(levelFeedbackKey(target.contentId, target.variantKey), feedback);
      qc.setQueryData(levelSuggestionKey(levelSuggestion.showId), { levelSuggestion });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['shows'] }),
        qc.invalidateQueries({ queryKey: levelSuggestionKey(levelSuggestion.showId) }),
      ]);
    },
  });
  return { ...mutation, feedback: current.data ?? null };
}
