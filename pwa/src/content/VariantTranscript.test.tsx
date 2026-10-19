// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { VariantTranscript } from './VariantTranscript';
import { passageSelection } from './usePassageActions';
const segment = { id: 's1', text: 'Cleaner public transport improves cities.', startMs: 2000, endMs: 5000, sourceSegments: ['original-1'] };
vi.mock('./useVariantTranscript', () => ({ useVariantTranscript: () => ({ segments: { isSuccess: true, data: { segments: [segment] } }, translated: {}, french: new Map(), canShowFrench: false, active: -1 }) }));
vi.mock('../dossiers/SegmentSources', () => ({ useDossierPassages: () => null, sourcesForSegment: () => [], SegmentSources: () => null }));
vi.mock('../listening/useOriginal', () => ({ useOriginal: () => ({ available: true, doc: { isSuccess: true } }),
  useOriginalPassage: () => ({ cited: [segment], listenable: false, jump: () => false }) }));
vi.mock('../player/MiniPlayer', () => ({ formatClock: () => '0:02' }));
vi.mock('../components/ui/kit', async (original) => ({ ...await original<typeof import('../components/ui/kit')>(),
  Sheet: ({ title, children }: { title: string; children: ReactNode }) => <section aria-label={title}>{children}</section> }));
vi.mock('../vocabulary/WordPickSheet', () => ({ WordPickSheet: (props: Record<string, unknown>) => <output>{JSON.stringify(props)}</output> }));
const variant: ContentVariant = { key: 'en-b1', kind: 'adaptation', language: 'en', timingStatus: 'exact', segmentsUrl: '/segments', audio: { source: 'r2', url: '/audio', durationMs: 5000, timingSource: 'kokoro' } };
const detail: ContentDetail = { content: { id: 'c', title: 'Test' }, publicationId: 'pub', variants: [variant] };
const mount = () => render(<VariantTranscript detail={detail} variant={variant} activePositionMs={null} verified playing={false} onSeek={() => {}} />);
afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); });
it('partage un volet pour l’original et le vocabulaire, avec le bon contexte', () => {
  mount(); fireEvent.contextMenu(screen.getByText(segment.text));
  expect(screen.getByText('Lire le passage original')).toBeDefined();
  fireEvent.click(screen.getByText('Garder un mot ou une expression'));
  expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({ contentId: 'c', publicationId: 'pub', variantKey: 'en-b1', segmentIndex: 0, sentence: segment.text });
});
it('préremplit l’expression sélectionnée dans le seul passage anglais', async () => {
  mount(); const text = screen.getByText(segment.text);
  const range = document.createRange(); range.setStart(text.firstChild!, 0); range.setEnd(text.firstChild!, 7);
  window.getSelection()?.addRange(range); fireEvent.pointerUp(text);
  await screen.findByText('Garder un mot ou une expression'); fireEvent.click(screen.getByText('Garder un mot ou une expression'));
  expect(JSON.parse(screen.getByRole('status').textContent!).word).toBe('Cleaner');
});
it('ignore une sélection qui déborde du texte ou inclut la traduction', () => {
  const view = render(<div><span data-passage-text>English text</span><p>Français</p></div>);
  const range = document.createRange(); range.selectNodeContents(view.container); window.getSelection()?.addRange(range);
  expect(passageSelection(view.container)).toBe('');
});
