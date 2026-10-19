import type { ContentSegment } from '../api/contents';
export interface SegmentBounds { index: number; start: number; end: number }
/** Bornes en secondes, strictement ordonnées : aucun instant inventé pour un texte non synchronisé. */
export function segmentBounds(segments: ContentSegment[]): SegmentBounds[] {
  const bounds: SegmentBounds[] = [];
  for (const [index, segment] of segments.entries()) {
    const { startMs, endMs } = segment;
    if (startMs === null || endMs === null || !Number.isFinite(startMs) || !Number.isFinite(endMs)
      || startMs < 0 || endMs <= startMs || (bounds.length > 0 && startMs / 1000 < bounds[bounds.length - 1]!.end)) return [];
    bounds.push({ index, start: startMs / 1000, end: endMs / 1000 });
  }
  return bounds;
}
export const currentSegment = (bounds: SegmentBounds[], seconds: number) => Number.isFinite(seconds)
  ? bounds.find((segment) => segment.start <= seconds && seconds < segment.end) : undefined;
export const currentOrNextSegment = (bounds: SegmentBounds[], seconds: number) => Number.isFinite(seconds)
  ? bounds.find((segment) => seconds < segment.end) : undefined;
