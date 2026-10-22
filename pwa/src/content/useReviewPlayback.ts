import { useEffect, useRef } from 'react';
import { useCompleteListeningReview } from '../api/listeningReviews';

/** Une seule confirmation après avoir réellement traversé le passage ouvert en réécoute. */
export function useReviewPlayback(contentId: string, publicationId: string, variantKey: string,
  reviewing: boolean, playing: boolean, positionSec: number) {
  const complete = useCompleteListeningReview(contentId, publicationId, variantKey);
  const range = useRef<{ start: number; end: number; started: boolean } | null>(null);
  const sent = useRef(false);
  const mutate = complete.mutate;
  useEffect(() => {
    const current = range.current;
    if (!current || !reviewing || sent.current) return;
    const position = positionSec * 1000;
    if (playing && position >= current.start && position < current.end) current.started = true;
    if (current.started && position >= current.end) { sent.current = true; mutate(); }
  }, [reviewing, playing, positionSec, mutate]);
  return { complete, arm: (start: number, end: number) => { range.current = { start, end, started: false }; },
    cancel: () => { range.current = null; } };
}
