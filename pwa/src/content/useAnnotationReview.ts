import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContentDetail, ContentSegment, ContentVariant, GuideAnnotation } from '../api/contents';
import { PICKS_KEY, saveWordPick } from '../vocabulary/api';

export function useAnnotationReview(detail: ContentDetail, variant: ContentVariant, segment: ContentSegment,
  segmentIndex: number, annotation: GuideAnnotation) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => saveWordPick({ word: annotation.text, sentence: segment.text,
      contentId: detail.content.id, publicationId: detail.publicationId, variantKey: variant.key,
      segmentIndex, language: 'en' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PICKS_KEY }),
  });
}
