import type { ContentDetail, ContentSegment, ContentSegments, ContentVariant } from '../api/contents';
import { timingVerified } from '../content/variants';

/**
 * I3 — basculer sur l'original au même passage.
 * Règle : sans horodatage fiable (`timingVerified`), on montre le texte des passages source,
 * jamais un instant inventé.
 */

/** Original cité par une version préparée : sa `derivedFrom` si c'est bien un original, sinon l'original publié. */
export function sourceVariantOf(detail: ContentDetail, variant: ContentVariant): ContentVariant | undefined {
  if (variant.kind === 'source') return undefined;
  if (variant.derivedFrom) {
    const named = detail.variants.find((v) => v.key === variant.derivedFrom && v.kind === 'source');
    if (named) return named;
  }
  return detail.variants.find((v) => v.kind === 'source' && v.key !== variant.key);
}

/** Passages originaux cités par un paragraphe, dans l'ordre de la transcription source ; renvois inconnus ignorés. */
export function citedSourceSegments(
  segment: Pick<ContentSegment, 'sourceSegments'>,
  doc: ContentSegments | undefined,
): ContentSegment[] {
  const ids = segment.sourceSegments ?? [];
  if (!doc || !ids.length) return [];
  const wanted = new Set(ids);
  return doc.segments.filter((s) => wanted.has(s.id));
}

/**
 * L'original peut être rejoint par l'audio seulement si son horodatage est déclaré exact :
 * sans durée déjà lue, `timingVerified(…, 0)` reste vrai pour « exact » et refuse le reste
 * (audio absent, horodatage inconnu, flux éditeur non vérifié).
 */
export function canListenOriginal(source: ContentVariant | undefined): boolean {
  return !!source && timingVerified(source, 0);
}

/** Instant du premier passage cité ; sans son horodatage, rester en texte. */
export function firstCitedMs(cited: ContentSegment[]): number | null {
  const first = cited[0]?.startMs;
  return first != null && Number.isFinite(first) && first >= 0 ? first : null;
}
