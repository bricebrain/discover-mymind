import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentSegment } from '../api/contents';
import { ActiveListening, type ActiveListeningState } from './ActiveListening';
import { currentSegment, segmentBounds } from './segmentBounds';
const segments: ContentSegment[] = [
  { id: 'a', text: 'First.', startMs: 0, endMs: 2000 },
  { id: 'b', text: 'Second.', startMs: 3000, endMs: 5000 },
  { id: 'c', text: 'Third.', startMs: 5000, endMs: 8000 },
];
class Media extends EventTarget {
  currentTime = 1; duration = 8; readyState = 1; paused = true; seeking = false; ended = false; playbackRate = 1.25;
  play = vi.fn(async () => { this.paused = false; this.dispatchEvent(new Event('play')); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')); });
  jump(seconds: number) {
    this.seeking = true; this.currentTime = seconds; this.dispatchEvent(new Event('seeking'));
    this.seeking = false; this.dispatchEvent(new Event('seeked'));
  }
  advance(seconds: number) { this.currentTime = seconds; this.dispatchEvent(new Event('timeupdate')); }
}
let media: Media, engine: ActiveListening, state: ActiveListeningState, detach: () => void;
beforeEach(() => {
  vi.useFakeTimers(); media = new Media(); state = { available: false, segmentIndex: -1, slowing: false, pauseAfterSegment: false, pausedAtBoundary: false };
  engine = new ActiveListening(media, (seconds) => media.jump(seconds), (next) => { state = next; });
  detach = engine.attach(); engine.setTrack('publication-a'); engine.configure('publication-a', segments, true);
});
afterEach(() => { detach(); vi.useRealTimers(); });
describe('bornes de passages', () => {
  it('utilise des bornes semi-ouvertes en secondes et garde les intervalles sans texte', () => {
    const bounds = segmentBounds(segments);
    expect(currentSegment(bounds, 0)?.index).toBe(0); expect(currentSegment(bounds, 2)).toBeUndefined();
    expect(currentSegment(bounds, 3)?.index).toBe(1); expect(currentSegment(bounds, 5)?.index).toBe(2);
    expect(currentSegment(bounds, 8)).toBeUndefined(); expect(currentSegment(bounds, NaN)).toBeUndefined();
  });
  it.each([null, NaN, -1, 2000])('refuse un début invalide : %s', (startMs) => {
    expect(segmentBounds([{ ...segments[0]!, startMs }])).toEqual([]);
  });
  it('refuse chevauchement, ordre inversé et fin absente', () => {
    expect(segmentBounds([segments[1]!, segments[0]!])).toEqual([]);
    expect(segmentBounds([{ ...segments[0]!, endMs: null }])).toEqual([]);
    expect(segmentBounds([{ ...segments[0]!, endMs: 4000 }, segments[1]!])).toEqual([]);
  });
});
describe('écoute active', () => {
  it('répète le segment courant depuis son début et reprend la lecture', () => {
    engine.repeat(); expect(media.currentTime).toBe(0); expect(media.play).toHaveBeenCalledOnce(); expect(state.segmentIndex).toBe(0);
  });
  it('ralentit un seul passage puis retrouve la vitesse choisie sans interrompre la lecture', () => {
    engine.slow(); expect(media.currentTime).toBe(0); expect(media.playbackRate).toBe(0.75); expect(state.slowing).toBe(true);
    media.advance(2); expect(media.playbackRate).toBe(1.25); expect(state.slowing).toBe(false); expect(media.paused).toBe(false);
  });
  it('un second ralentissement ne remplace pas la vitesse de retour par 0,75', () => {
    engine.slow(); media.advance(1); engine.slow(); media.advance(2);
    expect(media.playbackRate).toBe(1.25);
  });
  it('enchaîne les pauses, y compris un intervalle vide et deux passages contigus', async () => {
    engine.setPauseAfterSegment(true); await media.play(); media.advance(2.2);
    expect(media.paused).toBe(true); expect(media.currentTime).toBe(2); expect(state.segmentIndex).toBe(0);
    await media.play(); media.advance(4); expect(media.paused).toBe(false);
    media.advance(5.1); expect(media.currentTime).toBe(5); expect(media.paused).toBe(true); expect(state.segmentIndex).toBe(1); expect(state.pausedAtBoundary).toBe(true);
    await media.play(); expect(state.pausedAtBoundary).toBe(false); media.advance(6); expect(media.paused).toBe(false);
    media.advance(8); expect(media.currentTime).toBe(8); expect(state.segmentIndex).toBe(2); expect(media.paused).toBe(true);
    expect(media.pause).toHaveBeenCalledTimes(3);
  });
  it('permet de répéter le passage qui vient de se terminer après sa pause automatique', async () => {
    engine.setPauseAfterSegment(true); await media.play(); media.advance(2);
    engine.repeat(); expect(media.currentTime).toBe(0); expect(media.paused).toBe(false);
  });
  it('le ralentissement restaure la vitesse avant la pause automatique', () => {
    engine.setPauseAfterSegment(true); engine.slow(); media.advance(2.1);
    expect(media.paused).toBe(true); expect(media.playbackRate).toBe(1.25); expect(state.slowing).toBe(false);
  });
  it('une pause manuelle au milieu conserve le ralentissement jusqu’à la fin', async () => {
    engine.slow(); media.advance(1); media.pause(); expect(media.playbackRate).toBe(0.75);
    await media.play(); media.advance(2); expect(media.playbackRate).toBe(1.25);
  });
  it('un saut manuel annule le ralentissement et réarme la bonne fin', async () => {
    engine.setPauseAfterSegment(true); engine.slow(); engine.beforeSeek(); media.jump(6);
    expect(media.paused).toBe(false); expect(media.playbackRate).toBe(1.25);
    media.advance(7); expect(media.paused).toBe(false); media.advance(8); expect(media.paused).toBe(true);
  });
  it('le timer vérifie l’horloge média plutôt que d’inventer une progression pendant une attente', async () => {
    engine.setPauseAfterSegment(true); await media.play(); vi.advanceTimersByTime(1000);
    expect(media.paused).toBe(false); media.currentTime = 2;
    vi.advanceTimersByTime(1000); expect(media.paused).toBe(true);
  });
  it('la désactivation retire la pause déjà armée', async () => {
    engine.setPauseAfterSegment(true); await media.play(); engine.setPauseAfterSegment(false); media.advance(2.2);
    expect(media.paused).toBe(false);
  });
  it('un changement de piste ou publication restaure la vitesse et ignore une ancienne réponse de transcription', () => {
    engine.slow(); engine.setTrack('publication-b'); engine.configure('publication-a', segments, true);
    media.advance(2); expect(media.playbackRate).toBe(1.25); expect(state.available).toBe(false);
  });
  it('refuse une transcription non vérifiée ou des métadonnées absentes', () => {
    engine.configure('publication-a', segments, false); engine.slow(); expect(media.playbackRate).toBe(1.25);
    media.readyState = 0; engine.configure('publication-a', segments, true);
    expect(state.available).toBe(false); engine.repeat(); expect(media.play).not.toHaveBeenCalled();
  });
  it('conserve le dernier passage après une fin native avec pause active', async () => {
    engine.setPauseAfterSegment(true); media.jump(6); await media.play();
    media.currentTime = 8; media.paused = true; media.ended = true; media.dispatchEvent(new Event('ended'));
    expect(state.segmentIndex).toBe(2); engine.repeat(); expect(media.currentTime).toBe(5);
  });
  it('refuse des bornes au-delà de la durée réellement chargée', () => {
    media.duration = 6; engine.configure('publication-a', segments, true);
    expect(state.available).toBe(false);
  });
  it('une erreur audio ou le démontage restaure la vitesse et efface les timers', () => {
    engine.slow(); media.dispatchEvent(new Event('error'));
    expect(media.playbackRate).toBe(1.25); expect(state.available).toBe(false);
    engine.configure('publication-a', segments, true); engine.slow(); detach();
    expect(media.playbackRate).toBe(1.25); expect(vi.getTimerCount()).toBe(0);
  });
});
