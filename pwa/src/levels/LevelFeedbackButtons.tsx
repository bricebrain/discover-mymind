/** Publication explicite obligatoire ; showId fourni seulement pour une émission évaluable en anglais. */
import { Button } from '../components/ui/button';
import { Notice } from '../components/ui/kit';
import { useOnline } from '../offline/OfflineBanner';
import { useLevelFeedback } from './useLevelFeedback';
import type { LevelRating } from './types';
const RATINGS: [LevelRating, string][] = [['too_easy', 'Trop facile'], ['just_right', 'Juste'], ['too_hard', 'Trop dur']];
export function LevelFeedbackButtons({ contentId, variantKey, publicationId, showId }: {
  contentId: string; variantKey: string; publicationId: string; showId?: string;
}) {
  const feedback = useLevelFeedback(contentId, variantKey);
  const online = useOnline();
  if (!showId) return null;
  const current = feedback.feedback?.publicationId === publicationId ? feedback.feedback.rating : null;
  return <section aria-label="Difficulté de cette version" className="space-y-2">
    <p className="text-sm font-semibold">Ce niveau d’anglais te convient ?</p>
    <div className="flex flex-wrap gap-2">{RATINGS.map(([rating, label]) => <Button key={rating}
      variant={current === rating ? 'default' : 'outline'} aria-pressed={current === rating}
      disabled={!online || feedback.isPending} onClick={() => feedback.mutate({ publicationId, rating })}>{label}</Button>)}</div>
    {!online && <Notice>Reconnecte-toi pour donner ton avis.</Notice>}
    {feedback.isSuccess && feedback.data.feedback?.publicationId === publicationId && <p role="status" className="text-xs text-muted-foreground">Merci, Discover te proposera peut-être un autre niveau.</p>}
    {feedback.isError && <Notice tone="error">{feedback.error.message}</Notice>}
  </section>;
}
