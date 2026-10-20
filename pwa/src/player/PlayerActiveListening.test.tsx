// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerProvider, usePlayer } from './PlayerProvider';
import { ActiveListeningControls } from '../listening/ActiveListeningControls';
import type { ContentVariant } from '../api/contents';
import type { PlayerApi, Track } from './types';
vi.mock('../offline', () => ({ saveProgress: vi.fn(async () => false), cachedSegments: vi.fn(async () => null) }));
vi.mock('../api/progress', () => ({ fetchProgress: vi.fn(async () => null), progressKey: () => ['progress'] }));
class AudioFake extends EventTarget {
  preload = ''; src = ''; currentTime = 0; duration = 8; readyState = 1; paused = true; seeking = false; ended = false;
  playbackRate = 1; defaultPlaybackRate = 1;
  play = vi.fn(async () => { this.paused = false; this.dispatchEvent(new Event('play')); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')); });
  removeAttribute() { this.src = ''; } load() {}
}
let audio: AudioFake, current: PlayerApi, client: QueryClient;
const variant: ContentVariant = { key: 'en', kind: 'adaptation', language: 'en', timingStatus: 'exact', segmentsUrl: '/segments?publication=old', audio: {
  source: 'r2', url: '/audio', sha256: 'hash', durationMs: 8000, timingSource: 'kokoro' } };
const track: Track = { targetType: 'variant', targetId: 'c:en', audioRef: 'hash', src: '/audio', title: 'Test', subtitle: '', imageUrl: null, durationSec: 8,
  segmentSource: { publicationId: 'old', variant } };
function View() {
  current = usePlayer();
  return <><button onClick={() => current.play(track, { positionSec: 1 })}>Écouter</button><ActiveListeningControls controls={current.activeListening} /></>;
}
beforeEach(() => {
  audio = new AudioFake(); vi.stubGlobal('Audio', function () { return audio; });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ variantKey: 'en', segments: [
    { id: 'a', text: 'First.', startMs: 0, endMs: 2000 }, { id: 'b', text: 'Second.', startMs: 2000, endMs: 8000 },
  ] })));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); localStorage.clear();
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
it('partage les commandes avec le lecteur réel et ne persiste pas la vitesse temporaire', async () => {
  render(<QueryClientProvider client={client}><PlayerProvider><View /></PlayerProvider></QueryClientProvider>);
  fireEvent.click(screen.getByText('Écouter'));
  await screen.findByRole('region', { name: 'Écoute active' });
  act(() => current.setRate(1.25));
  fireEvent.click(screen.getByRole('button', { name: 'Ce passage à 0,75×' }));
  expect(audio.playbackRate).toBe(0.75); expect(current.rate).toBe(1.25); expect(localStorage.getItem('discover.playbackRate')).toBe('1.25');
  act(() => { audio.currentTime = 2.1; audio.dispatchEvent(new Event('timeupdate')); });
  expect(audio.playbackRate).toBe(1.25); expect(current.activeListening.slowing).toBe(false);
  expect(fetch).toHaveBeenCalledWith('/segments?publication=old', expect.anything());
});
it('une nouvelle vitesse choisie annule le ralentissement et reste la préférence', async () => {
  render(<QueryClientProvider client={client}><PlayerProvider><View /></PlayerProvider></QueryClientProvider>);
  fireEvent.click(screen.getByText('Écouter')); await screen.findByRole('region', { name: 'Écoute active' });
  fireEvent.click(screen.getByText('Ce passage à 0,75×'));
  act(() => current.setRate(1.1)); expect(audio.playbackRate).toBe(1.1);
  await waitFor(() => expect(current.activeListening.slowing).toBe(false));
  act(() => current.stop()); expect(audio.src).toBe(''); expect(current.activeListening.available).toBe(false);
});

it('réassocie les segments quand la même piste passe à une autre URL, y compris un audio local', async () => {
  render(<QueryClientProvider client={client}><PlayerProvider><View /></PlayerProvider></QueryClientProvider>);
  fireEvent.click(screen.getByText('Écouter')); await screen.findByRole('region', { name: 'Écoute active' });
  act(() => current.play({ ...track, src: 'blob:offline' }, { positionSec: 1 }));
  await waitFor(() => expect(current.activeListening.available).toBe(true));
  expect(audio.src).toBe('blob:offline');
});

it('réassocie une nouvelle publication même quand l’URL et l’empreinte audio sont identiques', async () => {
  render(<QueryClientProvider client={client}><PlayerProvider><View /></PlayerProvider></QueryClientProvider>);
  fireEvent.click(screen.getByText('Écouter')); await screen.findByRole('region', { name: 'Écoute active' });
  act(() => current.play({ ...track, segmentSource: { publicationId: 'new', variant: { ...variant, segmentsUrl: '/segments?publication=new' } } }, { positionSec: 1 }));
  await waitFor(() => expect(current.activeListening.available).toBe(true));
  expect(current.track?.segmentSource?.publicationId).toBe('new');
  expect(fetch).toHaveBeenCalledWith('/segments?publication=new', expect.anything());
});
