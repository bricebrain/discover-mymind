import { describe, expect, it } from 'vitest';
import { validateSegments } from '../src/publications/validation';
import type { Segments, Variant } from '../src/publications/types';

const text = '🎧 Please hold on, then hold on.';
const start = Array.from(text.slice(0, text.lastIndexOf('hold on'))).length;
const variant: Variant = { key: 'en-source', kind: 'source', language: 'en', segmentsFile: 'segments/en-source.json',
  audio: { source: 'r2', origin: 'original', timingSource: 'rss_vtt', durationMs: 3000 } };
const document = (): Segments => ({ schemaVersion: 1, variantKey: 'en-source', segments: [
  { id: 's1', text: 'Hello.', startMs: 0, endMs: 1000 }, { id: 's2', text, startMs: 1000, endMs: 3000 }],
  guide: { level: 'A2', voice: 'original', passage: { fromSegment: 's1', toSegment: 's1' }, expressions: [], listening: [],
    annotations: [{ segmentId: 's2', text: 'hold on', startChar: start, endChar: start + 7, meaning: 'Patiente.', note: 'On demande d’attendre.' }] } });

describe('aides sur toute la transcription', () => {
  it('accepte une annotation hors extrait, avec une position Unicode exacte', () => {
    const doc = document(); expect(validateSegments(doc, variant)).toEqual(doc);
  });
  it('accepte un texte analysé sans difficulté retenue', () => {
    const doc = document(); doc.guide!.annotations = [];
    expect(validateSegments(doc, variant)).toEqual(doc);
  });
  it('refuse les citations inventées, positions fausses, chevauchements et notes vides', () => {
    for (const change of ['quote', 'position', 'overlap', 'blank', 'unknown']) {
      const doc = document(), note = doc.guide!.annotations![0]!;
      if (change === 'quote') note.text = 'hold out';
      if (change === 'position') note.startChar++;
      if (change === 'overlap') doc.guide!.annotations!.push({ ...note });
      if (change === 'blank') note.note = ' ';
      if (change === 'unknown') note.segmentId = 'unknown';
      expect(() => validateSegments(doc, variant)).toThrowError(expect.objectContaining({ code: 'invalid_guide' }));
    }
  });
  it('refuse plus de trois aides dans un segment, même sans chevauchement', () => {
    const doc = document(); doc.segments[1]!.text = 'a b c d';
    doc.guide!.annotations = [...'abcd'].map((letter, i) => ({ segmentId: 's2', text: letter,
      startChar: i * 2, endChar: i * 2 + 1, meaning: 'Sens.', note: 'Explication.' }));
    expect(() => validateSegments(doc, variant)).toThrowError(expect.objectContaining({ code: 'invalid_guide' }));
  });
  it('reste compatible avec un ancien guide sans annotations', () => {
    const doc = document(); delete doc.guide!.annotations;
    doc.guide!.expressions = [{ segmentId: 's1', text: 'Hello', note: 'Bonjour.' }];
    expect(validateSegments(doc, variant)).toEqual(doc);
  });
});
