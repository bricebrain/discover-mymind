import { useContentSegments, type ContentDetail, type ContentVariant } from '../api/contents';
import { QuizCard } from '../quiz/QuizCard';
import { LevelFeedbackButtons } from '../levels/LevelFeedbackButtons';

/** Même publication que la transcription ; le quiz ne saute que vers des horodatages vérifiés. */
export function VersionLearning({ detail, variant, verified, onSeek, showId }: {
  detail: ContentDetail; variant: ContentVariant; verified: boolean; onSeek: (seconds: number) => void; showId?: string;
}) {
  const segments = useContentSegments(detail.publicationId, variant);
  if (variant.language !== 'en') return null;
  const target = { contentId: detail.content.id, publicationId: detail.publicationId, variantKey: variant.key };
  const seek = verified && variant.audio && segments.data ? (index: number) => {
    const start = segments.data.segments[index]?.startMs;
    if (start != null && Number.isFinite(start) && start >= 0) onSeek(start / 1000);
  } : undefined;
  return <div className="mt-6 space-y-5">
    <QuizCard {...target} onSeek={seek} />
    <LevelFeedbackButtons {...target} showId={showId ?? detail.episode?.showId} />
  </div>;
}
