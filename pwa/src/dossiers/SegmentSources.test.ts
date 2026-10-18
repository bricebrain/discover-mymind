import { describe, expect, it } from 'vitest';
import type { DossierSource } from '../api/contents';
import { sourceLink, sourcesForSegment, type SourcePassage } from './SegmentSources';

const src = (id: string, type: DossierSource['type'], ref: string): DossierSource => ({ id, type, ref, title: `Titre ${id}`, capturedAt: '2026-10-19' });
const d1 = src('d1', 'episode', 'a'.repeat(20)), d2 = src('d2', 'reflection', 'note-id'), d3 = src('d3', 'content', 'youtube-x');
const passages = new Map<string, SourcePassage>([
  ['d1-s2', { source: d1, index: 0, startMs: 90_000 }],
  ['d1-s1', { source: d1, index: 0, startMs: 61_000 }],
  ['d2-s1', { source: d2, index: 1, startMs: null }],
  ['d3-s1', { source: d3, index: 2, startMs: null }],
]);

describe('sources citées par un paragraphe', () => {
  it('une entrée par source, dans l’ordre du dossier, avec le premier instant connu', () => {
    const cited = sourcesForSegment({ sourceSegments: ['d3-s1', 'd1-s2', 'd2-s1', 'd1-s1'] }, passages);
    expect(cited.map((p) => p.source.id)).toEqual(['d1', 'd2', 'd3']);
    expect(cited[0]!.startMs).toBe(61_000);
    expect(cited[1]!.startMs).toBeNull();
  });
  it('ignore les renvois inconnus et n’affiche rien sans source', () => {
    expect(sourcesForSegment({ sourceSegments: ['zz'] }, passages)).toEqual([]);
    expect(sourcesForSegment({}, passages)).toEqual([]);
  });
  it('ouvre chaque type de source au bon endroit', () => {
    expect(sourceLink(d1)).toBe(`/?e=${'a'.repeat(20)}`);
    expect(sourceLink(d2)).toBe('/mind?n=note-id');
    expect(sourceLink(d3)).toBe('/library/youtube-x');
  });
});
