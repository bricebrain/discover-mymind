import { useEffect, useRef, useState } from 'react';
import { useContentSegments, type ContentDetail, type ContentVariant } from '../api/contents';
import { activeContentSegment, frenchBySegment, frenchCompanion } from './variants';

export function useVariantTranscript(detail: ContentDetail, variant: ContentVariant, activePositionMs: number | null, playing: boolean) {
  const [showFrench, setShowFrench] = useState(false);
  const [follow, setFollow] = useState(true);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const segments = useContentSegments(detail.publicationId, variant);
  const candidate = frenchCompanion(variant, detail.variants);
  const completeInline = !!segments.data?.segments.length && segments.data.segments.every((s) => !!s.fr?.trim());
  const translated = useContentSegments(detail.publicationId, candidate, showFrench && segments.isSuccess && !completeInline);
  const french = segments.data ? frenchBySegment(variant, segments.data, candidate, showFrench ? translated.data : undefined) : new Map<string, string>();
  const canShowFrench = variant.language.split('-')[0] !== 'fr' && (!!candidate || french.size > 0);
  const active = activeContentSegment(segments.data?.segments ?? [], activePositionMs);

  useEffect(() => {
    if (follow && playing && active >= 0) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, follow, playing]);

  return { segments, translated, french, showFrench, setShowFrench, canShowFrench, follow, setFollow, active, activeRef };
}
