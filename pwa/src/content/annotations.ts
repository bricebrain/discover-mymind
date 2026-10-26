import type { GuideAnnotation } from '../api/contents';

export interface AnnotationPiece { text: string; annotation?: GuideAnnotation }

export function annotationsBySegment(notes: GuideAnnotation[] = []): Map<string, GuideAnnotation[]> {
  const result = new Map<string, GuideAnnotation[]>();
  for (const note of notes) result.set(note.segmentId, [...(result.get(note.segmentId) ?? []), note]);
  return result;
}

/** Les positions du contrat comptent les points de code, pas les unités UTF-16 de JavaScript. */
export function annotationPieces(text: string, notes: GuideAnnotation[]): AnnotationPiece[] {
  const characters = Array.from(text), pieces: AnnotationPiece[] = [];
  let cursor = 0;
  for (const note of [...notes].sort((a, b) => a.startChar - b.startChar)) {
    if (!Number.isInteger(note.startChar) || !Number.isInteger(note.endChar) || note.startChar < cursor
      || note.endChar <= note.startChar || note.endChar > characters.length
      || characters.slice(note.startChar, note.endChar).join('') !== note.text) continue;
    if (note.startChar > cursor) pieces.push({ text: characters.slice(cursor, note.startChar).join('') });
    pieces.push({ text: note.text, annotation: note });
    cursor = note.endChar;
  }
  if (cursor < characters.length) pieces.push({ text: characters.slice(cursor).join('') });
  return pieces;
}
