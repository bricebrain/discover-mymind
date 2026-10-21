// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuidePanel, guidePassage } from './GuidePanel';
import type { ContentDetail, ContentGuide, ContentSegments, ContentVariant } from '../api/contents';

const guide: ContentGuide = {
  level: 'B1', voice: 'original', passage: { fromSegment: 's2', toSegment: 's3', reason: 'Explique la décision.' },
  expressions: [{ segmentId: 's3', text: 'hold rates steady', meaning: 'maintenir les taux', note: 'Bloc à retenir.' }],
  listening: [{ segmentId: 's2', text: 'expected to', note: 'À écouter : « to » réduit.' }],
};
const doc: ContentSegments = { schemaVersion: 1, variantKey: 'en-source', guide, segments: [
  { id: 's1', text: 'Intro.', startMs: 0, endMs: 10_000 },
  { id: 's2', text: 'The bank is expected to decide.', startMs: 10_000, endMs: 70_000 },
  { id: 's3', text: 'It will hold rates steady.', startMs: 70_000, endMs: 130_000 },
] };
let segments: ContentSegments = doc;
const pause = vi.fn();
vi.mock('../api/contents', () => ({ useContentSegments: () => ({ data: segments }) }));
vi.mock('../player/PlayerProvider', () => ({ usePlayer: () => ({ pause }) }));
const variant: ContentVariant = { key: 'en-source', kind: 'source', language: 'en', timingStatus: 'unverified', segmentsUrl: '/s',
  audio: { source: 'r2', url: '/a', durationMs: 130_000, timingSource: 'rss_vtt' } };
const detail: ContentDetail = { content: { id: 'c', title: 'Rates' }, publicationId: 'p', variants: [variant] };
beforeEach(() => { segments = doc; pause.mockReset(); });
afterEach(cleanup);

it('borne le passage avec les horodatages du document, sinon ne propose rien', () => {
  expect(guidePassage(guide, doc.segments)).toMatchObject({ startMs: 10_000, endMs: 130_000 });
  expect(guidePassage({ ...guide, passage: { fromSegment: 's3', toSegment: 's2' } }, doc.segments)).toBeNull();
  expect(guidePassage(undefined, doc.segments)).toBeNull();
});

it('lance l’écoute sans texte au début du passage, puis révèle expressions et points d’écoute', () => {
  const play = vi.fn(), hide = vi.fn();
  render(<GuidePanel detail={detail} variant={variant} playing={false} positionSec={0} onPlay={play} onHideText={hide} />);
  expect(screen.getByText('Passage 0:10 – 2:10')).toBeDefined();
  fireEvent.click(screen.getByText('1. Écouter sans le texte'));
  expect(play).toHaveBeenLastCalledWith(10);
  expect(hide).toHaveBeenLastCalledWith(true);
  expect(screen.queryByText('hold rates steady')).toBeNull();
  fireEvent.click(screen.getByText('2. Comprendre'));
  expect(hide).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByLabelText('Écouter « hold rates steady »'));
  expect(play).toHaveBeenLastCalledWith(70);
  expect(screen.getByText('À écouter')).toBeDefined();
});

it('arrête la lecture à la fin du passage pendant une écoute guidée', () => {
  const props = { detail, variant, onPlay: vi.fn(), onHideText: vi.fn() };
  const view = render(<GuidePanel {...props} playing positionSec={100} />);
  fireEvent.click(screen.getByText('3. Réécouter sans le texte'));
  view.rerender(<GuidePanel {...props} playing positionSec={131} />);
  expect(pause).toHaveBeenCalledOnce();
});

it('n’affiche rien sans guide', () => {
  segments = { ...doc, guide: undefined };
  const view = render(<GuidePanel detail={detail} variant={variant} playing={false} positionSec={0} onPlay={() => {}} onHideText={() => {}} />);
  expect(view.container.textContent).toBe('');
});
