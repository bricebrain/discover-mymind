// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { PlayerApi, Track } from '../player/types';
import { useListeningAutomation } from './useListeningAutomation';
import { sleepStore } from './sleep';
import { nextDownload } from './nextUp';
const track: Track = { targetType: 'variant', targetId: 'c:en', audioRef: 'hash', src: '/audio', title: 'Test', subtitle: '', imageUrl: null, durationSec: 8 };
vi.mock('../offline', () => ({ useOffline: () => ({ records: [{ key: 'c:en', audioRef: 'hash' }] }) }));
vi.mock('./nextUp', () => ({ readAutoplayNext: () => true, nextDownload: vi.fn(() => ({})), trackFromDownload: () => track }));
function player(pauseAfterSegment: boolean): PlayerApi {
  return { track, position: 8, duration: 8, mediaDuration: 8, rate: 1.25, playing: false, buffering: false, error: null, ended: true,
    play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), seek: vi.fn(), skip: vi.fn(), setRate: vi.fn(), stop: vi.fn(), configureActiveListening: vi.fn(),
    activeListening: { available: true, pausedAtBoundary: true, segmentIndex: 2, slowing: false, pauseAfterSegment, repeat: vi.fn(), slow: vi.fn(), setPauseAfterSegment: vi.fn() } };
}
afterEach(() => { cleanup(); sleepStore.cancel(); vi.clearAllMocks(); });
it('la pause de passage bloque l’enchaînement à la fin de la dernière phrase', () => {
  const current = player(true); renderHook(() => useListeningAutomation(current));
  expect(current.play).not.toHaveBeenCalled(); expect(nextDownload).not.toHaveBeenCalled();
});
it('l’enchaînement reste disponible sans pause active, une seule fois par fin', () => {
  const current = player(false); const view = renderHook(() => useListeningAutomation(current)); view.rerender();
  expect(current.play).toHaveBeenCalledTimes(1);
});
it('la minuterie de fin reste prioritaire et s’efface même avec pause de passage', () => {
  sleepStore.start('end'); const current = player(true); renderHook(() => useListeningAutomation(current));
  expect(current.pause).toHaveBeenCalled(); expect(current.play).not.toHaveBeenCalled(); expect(sleepStore.getSnapshot()).toBeNull();
});
