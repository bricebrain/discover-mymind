import { HttpError } from '../http';
import type { GuideAnnotation, Segment } from './types';

/** Citation exacte et positions Unicode : identique au contrôle de l'Atelier. */
export function validAnnotations(annotations: GuideAnnotation[], segments: Segment[]): void {
  const texts = new Map(segments.map((s) => [s.id, Array.from(s.text)]));
  const counts = new Map<string, number>(), ends = new Map<string, number>();
  for (const note of annotations) {
    const text = texts.get(note.segmentId);
    const count = (counts.get(note.segmentId) ?? 0) + 1;
    if (!text || note.startChar < 0 || note.endChar <= note.startChar || note.endChar > text.length
      || text.slice(note.startChar, note.endChar).join('') !== note.text
      || !note.text.trim() || !note.meaning.trim() || !note.note.trim()
      || count > 3 || note.startChar < (ends.get(note.segmentId) ?? 0)) {
      throw new HttpError(422, 'invalid_guide', 'Annotations de compréhension invalides.');
    }
    counts.set(note.segmentId, count);
    ends.set(note.segmentId, note.endChar);
  }
}
