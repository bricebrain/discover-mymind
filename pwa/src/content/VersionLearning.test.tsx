// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VersionLearning } from './VersionLearning';
import type { ContentDetail, ContentVariant } from '../api/contents';
vi.mock('../api/contents', () => ({ useContentSegments: () => ({ data: { segments: [{ startMs: 12500 }, { startMs: null }] } }) }));
vi.mock('../quiz/QuizCard', () => ({ QuizCard: (p: { publicationId: string; onSeek?: (index: number) => void }) => <div>
  <span>{p.publicationId}</span><button disabled={!p.onSeek} onClick={() => p.onSeek?.(0)}>Réécouter</button>
  <button onClick={() => p.onSeek?.(1)}>Sans horodatage</button></div> }));
vi.mock('../levels/LevelFeedbackButtons', () => ({ LevelFeedbackButtons: (p: { showId?: string }) => <span>{p.showId}</span> }));
const variant: ContentVariant = { key: 'en-b1', kind: 'adaptation', language: 'en', timingStatus: 'exact', segmentsUrl: '/segments', audio: {
  source: 'r2', url: '/audio', durationMs: 20000, timingSource: 'kokoro' } };
const detail: ContentDetail = { content: { id: 'c', title: 'Test' }, publicationId: 'publication', variants: [variant], episode: { id: 'e', showId: 'show' } };
afterEach(cleanup);
it('réécoute le segment adapté en secondes et transmet publication/émission', () => {
  const play = vi.fn(); render(<VersionLearning detail={detail} variant={variant} verified onSeek={play} />);
  fireEvent.click(screen.getByText('Réécouter')); expect(play).toHaveBeenCalledWith(12.5);
  fireEvent.click(screen.getByText('Sans horodatage')); expect(play).toHaveBeenCalledTimes(1);
  expect(screen.getByText('publication')).toBeDefined(); expect(screen.getByText('show')).toBeDefined();
});
it('n’invente pas de synchronisation non vérifiée', () => {
  render(<VersionLearning detail={detail} variant={variant} verified={false} onSeek={() => {}} />);
  expect((screen.getByText('Réécouter') as HTMLButtonElement).disabled).toBe(true);
});
it('réserve les actions de compréhension aux versions anglaises', () => {
  const view = render(<VersionLearning detail={detail} variant={{ ...variant, language: 'fr' }} verified onSeek={() => {}} />);
  expect(view.container.textContent).toBe('');
});
