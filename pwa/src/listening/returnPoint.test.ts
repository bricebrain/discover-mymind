import { afterEach, describe, expect, it, vi } from 'vitest';
import { playReturnPoint, returnPointStore, type ReturnPoint } from './returnPoint';
import type { Track } from '../player/types';

const track: Track = { targetType: 'variant', targetId: 'c1:en-b1', audioRef: 'sha', src: '/audio.mp3',
  title: 'Titre', subtitle: 'Intégral B1 · Anglais', imageUrl: null, durationSec: 600 };

const point = (over: Partial<ReturnPoint> = {}): ReturnPoint => ({
  contentId: 'c1', variantKey: 'en-b1', label: 'Intégral B1', title: 'Titre', track,
  jumpedTo: { targetType: 'variant', targetId: 'c1:en-source', audioRef: 'src-sha' }, ...over,
});

afterEach(() => returnPointStore.clear());

describe('point de retour vers la version adaptée', () => {
  it('conserve un seul point, notifie et s’efface', () => {
    const heard = vi.fn();
    const unlisten = returnPointStore.subscribe(heard);
    returnPointStore.set(point());
    expect(returnPointStore.getSnapshot()?.variantKey).toBe('en-b1');
    returnPointStore.set(point({ variantKey: 'en-b1-court' }));
    expect(returnPointStore.getSnapshot()?.variantKey).toBe('en-b1-court');
    expect(heard).toHaveBeenCalledTimes(2);
    returnPointStore.clear();
    expect(returnPointStore.getSnapshot()).toBeNull();
    // Effacer deux fois ne notifie pas pour rien.
    returnPointStore.clear();
    expect(heard).toHaveBeenCalledTimes(3);
    unlisten();
  });
  it('reprend la version adaptée à la position quittée, puis oublie le point', () => {
    returnPointStore.set(point({ positionSec: 83.5 }));
    const play = vi.fn();
    expect(playReturnPoint(returnPointStore.getSnapshot()!, { play })).toBe(true);
    expect(play).toHaveBeenCalledWith(track, { positionSec: 83.5 });
    expect(returnPointStore.getSnapshot()).toBeNull();
  });
  it('sans position connue, laisse la progression enregistrée décider de la reprise', () => {
    returnPointStore.set(point());
    const play = vi.fn();
    expect(playReturnPoint(returnPointStore.getSnapshot()!, { play })).toBe(true);
    expect(play).toHaveBeenCalledWith(track, undefined);
  });
  it('une version texte seul n’a rien à jouer : le retour se fera par la page', () => {
    returnPointStore.set(point({ track: null }));
    const play = vi.fn();
    expect(playReturnPoint(returnPointStore.getSnapshot()!, { play })).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});
