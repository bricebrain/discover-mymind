import { describe, expect, it } from 'vitest';
import type { ContentDetail, ContentSegment, ContentSegments, ContentVariant } from '../api/contents';
import { canListenOriginal, citedSourceSegments, firstCitedMs, sourceVariantOf } from './sourceJump';

const audio = (over: Partial<NonNullable<ContentVariant['audio']>> = {}): NonNullable<ContentVariant['audio']> => ({
  source: 'r2', url: '/audio.mp3', sha256: 'sha', durationMs: 600_000, timingSource: 'kokoro', ...over,
});
const source: ContentVariant = { key: 'en-source', kind: 'source', language: 'en', segmentsUrl: '/source',
  timingStatus: 'unverified', audio: audio({ source: 'publisher_stream', url: 'https://cdn.example.com/s.mp3', sha256: undefined, timingSource: 'rss_srt' }) };
const adapted: ContentVariant = { ...source, key: 'en-b1', kind: 'adaptation', cefrLevel: 'B1', derivedFrom: 'en-source', timingStatus: 'exact' };
const detail: ContentDetail = { content: { id: 'c1', title: 'Titre' }, publicationId: 'one', variants: [source, adapted] };

const seg = (id: string, startMs: number | null, text = id): ContentSegment => ({ id, text, startMs, endMs: startMs === null ? null : startMs + 1000 });
const doc: ContentSegments = { schemaVersion: 1, variantKey: 'en-source', segments: [seg('a', 1000), seg('b', 4000), seg('c', 9000)] };

describe('original de la version affichée', () => {
  it('suit derivedFrom quand il désigne un original', () => {
    expect(sourceVariantOf(detail, adapted)?.key).toBe('en-source');
  });
  it('sans derivedFrom, prend l’original publié ; jamais depuis l’original lui-même', () => {
    expect(sourceVariantOf(detail, { ...adapted, derivedFrom: null })?.key).toBe('en-source');
    expect(sourceVariantOf({ ...detail, variants: [adapted] }, adapted)).toBeUndefined();
    expect(sourceVariantOf(detail, source)).toBeUndefined();
  });
  it('un derivedFrom inconnu retombe sur l’original publié', () => {
    expect(sourceVariantOf(detail, { ...adapted, derivedFrom: 'disparu' })?.key).toBe('en-source');
  });
});

describe('passages cités par un paragraphe', () => {
  it('sont rendus dans l’ordre de la source, pas de la citation', () => {
    const cited = citedSourceSegments({ sourceSegments: ['c', 'a', 'b', 'a'] }, doc);
    expect(cited.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
  it('ignore les renvois inconnus et les paragraphes sans renvoi', () => {
    expect(citedSourceSegments({ sourceSegments: ['a', 'zz'] }, doc).map((s) => s.id)).toEqual(['a']);
    expect(citedSourceSegments({ sourceSegments: ['a'] }, undefined)).toEqual([]);
    expect(citedSourceSegments({}, doc)).toEqual([]);
  });
});

describe('écouter l’original ou seulement le lire', () => {
  it('un horodatage déclaré exact permet d’y aller par l’audio', () => {
    expect(canListenOriginal(adapted)).toBe(true);
    expect(canListenOriginal({ ...source, timingStatus: 'exact' })).toBe(true);
  });
  it('sans audio, sans horodatage fiable ou flux éditeur non vérifié : texte seulement', () => {
    expect(canListenOriginal(undefined)).toBe(false);
    expect(canListenOriginal({ ...source, audio: null, timingStatus: 'unverified' })).toBe(false);
    expect(canListenOriginal(source)).toBe(false); // flux éditeur, horodatage non vérifié
    expect(canListenOriginal({ ...adapted, audio: audio({ timingSource: 'none' }) })).toBe(false);
    expect(canListenOriginal({ ...adapted, timingStatus: 'none' })).toBe(false);
  });
  it('exige un instant fiable sur le premier passage cité, sinon reste en texte', () => {
    expect(firstCitedMs(doc.segments)).toBe(1000);
    expect(firstCitedMs([seg('x', null), seg('y', 5000)])).toBeNull();
    expect(firstCitedMs([seg('x', -1)])).toBeNull();
    expect(firstCitedMs([seg('x', null)])).toBeNull();
    expect(firstCitedMs([])).toBeNull();
  });
});
