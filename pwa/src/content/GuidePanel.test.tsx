// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuidePanel, guidePassage } from './GuidePanel';
import type { ContentDetail, ContentGuide, ContentSegments, ContentVariant } from '../api/contents';

const guide: ContentGuide = {
  level: 'B1', voice: 'original', passage: { fromSegment: 's2', toSegment: 's3', reason: 'Explique la décision.' },
  expressions: [{ segmentId: 's3', text: 'hold rates steady', meaning: 'maintenir les taux', note: 'Bloc à retenir.' },
    { segmentId: 's2', text: 'is expected to', meaning: 'devrait', note: 'Très fréquent.' }],
  listening: [{ segmentId: 's2', text: 'expected to', note: 'À écouter : « to » réduit.' }],
};
const doc: ContentSegments = { schemaVersion: 1, variantKey: 'en-source', guide, segments: [
  { id: 's1', text: 'Intro.', startMs: 0, endMs: 10_000 },
  { id: 's2', text: 'The bank is expected to decide.', startMs: 10_000, endMs: 70_000 },
  { id: 's3', text: 'It will hold rates steady.', startMs: 70_000, endMs: 130_000 },
] };
let segments: ContentSegments = doc;
const player = { pause: vi.fn(), rate: 1, setRate: vi.fn() };
const saveWordPick = vi.fn(async () => ({ pick: {}, alreadySaved: false }));
const submitDictation = vi.fn();
vi.mock('../api/contents', () => ({ useContentSegments: () => ({ data: segments }) }));
// Comme le vrai lecteur, un nouvel objet à chaque rendu.
vi.mock('../player/PlayerProvider', () => ({ usePlayer: () => ({ ...player }) }));
vi.mock('../vocabulary/api', () => ({ PICKS_KEY: ['picks'], saveWordPick: (...a: unknown[]) => saveWordPick(...(a as [])) }));
vi.mock('../api/dictation', async (original) => ({ ...(await original<typeof import('../api/dictation')>()),
  submitDictation: (...a: unknown[]) => submitDictation(...a) }));
const variant: ContentVariant = { key: 'en-source', kind: 'source', language: 'en', timingStatus: 'unverified', segmentsUrl: '/s',
  audio: { source: 'r2', url: '/a', durationMs: 130_000, timingSource: 'rss_vtt' } };
const detail: ContentDetail = { content: { id: 'c', title: 'Rates' }, publicationId: 'p', variants: [variant] };
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const panel = (props: Partial<Parameters<typeof GuidePanel>[0]> = {}) =>
  <GuidePanel detail={detail} variant={variant} playing={false} positionSec={0} onPlay={() => {}} onHideText={() => {}} {...props} />;
beforeEach(() => { segments = doc; player.pause.mockReset(); player.setRate.mockReset(); saveWordPick.mockClear(); submitDictation.mockReset(); });
afterEach(cleanup);

it('borne le passage avec les horodatages du document, sinon ne propose rien', () => {
  expect(guidePassage(guide, doc.segments)).toMatchObject({ startMs: 10_000, endMs: 130_000, segments: [{ id: 's2' }, { id: 's3' }] });
  expect(guidePassage({ ...guide, passage: { fromSegment: 's3', toSegment: 's2' } }, doc.segments)).toBeNull();
  expect(guidePassage(undefined, doc.segments)).toBeNull();
});

it('lance l’écoute sans texte au début du passage, puis révèle expressions et points d’écoute', () => {
  const play = vi.fn(), hide = vi.fn();
  render(panel({ onPlay: play, onHideText: hide }), { wrapper });
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
  const view = render(panel({ playing: true, positionSec: 100 }), { wrapper });
  fireEvent.click(screen.getByText('4. Réécouter sans le texte'));
  view.rerender(panel({ playing: true, positionSec: 131 }));
  expect(player.pause).toHaveBeenCalledOnce();
});

it('ajoute une expression, ou toutes, à la révision avec sa phrase', async () => {
  render(panel(), { wrapper });
  fireEvent.click(screen.getByText('2. Comprendre'));
  fireEvent.click(screen.getByLabelText('Ajouter « hold rates steady » à ma révision'));
  await waitFor(() => expect(saveWordPick).toHaveBeenCalledWith({ word: 'hold rates steady', sentence: 'It will hold rates steady.',
    contentId: 'c', publicationId: 'p', variantKey: 'en-source', segmentIndex: 2, language: 'en' }));
  await waitFor(() => expect(screen.getByLabelText('« hold rates steady » est dans ta révision')).toBeDefined());
  expect(screen.queryByText('Tout ajouter à ma révision')).toBeNull(); // il n'en reste qu'une
});

it('dicte phrase par phrase, texte masqué, avec arrêt en fin de phrase et lecture ralentie rétablie', async () => {
  const play = vi.fn(), hide = vi.fn();
  submitDictation.mockResolvedValue({ id: 'a', segmentId: 's2', expected: 'The bank is expected to decide.', expectedWords: 6, correctWords: 5,
    accuracy: 5 / 6, tokens: [{ expected: 'the', typed: 'the', status: 'ok' }, { expected: 'to', status: 'missing' }],
    errors: [{ expected: 'to', heard: '', category: 'reduced_form', explanation: '« to » est presque avalé.' }], tip: 'Guette les petits mots.' });
  const view = render(panel({ onPlay: play, onHideText: hide, playing: true }), { wrapper });
  fireEvent.click(screen.getByText('3. Dictée'));
  expect(hide).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByText('Écouter la phrase'));
  expect(play).toHaveBeenLastCalledWith(10);
  view.rerender(panel({ onPlay: play, onHideText: hide, playing: true, positionSec: 71 }));
  expect(player.pause).toHaveBeenCalled();
  expect(hide).toHaveBeenLastCalledWith(true); // le texte reste masqué pendant toute la dictée
  fireEvent.click(screen.getByText('Plus lentement'));
  expect(player.setRate).toHaveBeenLastCalledWith(0.8);
  fireEvent.change(screen.getByLabelText('Ce que tu entends'), { target: { value: 'the bank is expected decide' } });
  fireEvent.click(screen.getByText('Vérifier'));
  await waitFor(() => expect(screen.getByText('83 % des mots reconnus · 5/6')).toBeDefined());
  expect(submitDictation).toHaveBeenCalledWith('c', 'en-source', { publicationId: 'p', segmentId: 's2', typed: 'the bank is expected decide' });
  expect(screen.getByText('Forme réduite')).toBeDefined();
  expect(screen.getByText('Guette les petits mots.')).toBeDefined();
  fireEvent.click(screen.getByText('Phrase suivante'));
  expect(screen.getByText(/Phrase 2 \/ 2/)).toBeDefined();
  view.unmount();
  expect(player.setRate).toHaveBeenLastCalledWith(1);
});

it('n’affiche rien sans guide', () => {
  segments = { ...doc, guide: undefined };
  const view = render(panel(), { wrapper });
  expect(view.container.textContent).toBe('');
});

it('dicte les unités du guide avec leurs propres bornes et envoie unitId', async () => {
  segments = { ...doc, guide: { ...guide, dictation: [
    { id: 'd1', segmentId: 's2', text: 'The bank is expected', startMs: 12000, endMs: 16000 },
    { id: 'd2', segmentId: 's2', text: 'to decide.', startMs: 16000, endMs: 18000 },
    { id: 'd3', segmentId: 's3', text: 'It will hold rates steady.', startMs: 70000, endMs: 130000 },
  ] } };
  submitDictation.mockResolvedValue({ id: 'a', unitId: 'd1', segmentId: 's2', expectedWords: 4, correctWords: 4,
    accuracy: 1, tokens: [], errors: [], tip: null });
  const play = vi.fn();
  const view = render(panel({ onPlay: play, playing: true }), { wrapper });
  fireEvent.click(screen.getByText('3. Dictée'));
  expect(screen.getByText('Phrase 1 / 3')).toBeDefined();
  fireEvent.click(screen.getByText('Écouter la phrase'));
  expect(play).toHaveBeenLastCalledWith(12);
  view.rerender(panel({ onPlay: play, playing: true, positionSec: 17 }));
  expect(player.pause).toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Ce que tu entends'), { target: { value: 'The bank is expected' } });
  fireEvent.click(screen.getByText('Vérifier'));
  await waitFor(() => expect(submitDictation).toHaveBeenCalledWith('c', 'en-source',
    { publicationId: 'p', unitId: 'd1', typed: 'The bank is expected' }));
  await waitFor(() => expect(screen.getByText('Phrase suivante')).toBeDefined());
  fireEvent.click(screen.getByText('Phrase suivante'));
  fireEvent.click(screen.getByText('Écouter la phrase'));
  expect(play).toHaveBeenLastCalledWith(16);
});
