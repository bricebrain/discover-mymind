import { useSyncExternalStore } from 'react';
import type { Track } from '../player/types';

/** Où reprendre la version adaptée après un saut vers l'original (I3). */
export interface ReturnPoint {
  contentId: string;
  variantKey: string;
  /** Nom lisible de la version quittée, ex. « Intégral B1 ». */
  label: string;
  title: string;
  /** Position quittée dans la version adaptée ; sans elle, la reprise vient de la progression enregistrée. */
  positionSec?: number;
  /** null : version texte seul, le retour rouvre la page au lieu de jouer. */
  track: Track | null;
  /** Piste originale rejointe : le bouton de retour ne s'affiche que sur elle. */
  jumpedTo: { targetType: Track['targetType']; targetId: string; audioRef: string } | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let point: ReturnPoint | null = null;

/** Point de retour unique, gardé en mémoire pour la session (jamais persisté : l'audio local peut disparaître). */
export const returnPointStore = {
  set(next: ReturnPoint) {
    point = next;
    for (const l of listeners) l();
  },
  clear() {
    if (!point) return;
    point = null;
    for (const l of listeners) l();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: () => point,
};

export function useReturnPoint(): ReturnPoint | null {
  return useSyncExternalStore(returnPointStore.subscribe, returnPointStore.getSnapshot, returnPointStore.getSnapshot);
}

/** Reprend la version adaptée à l'endroit quitté, puis oublie le point de retour. */
export function playReturnPoint(
  point: ReturnPoint,
  player: { play: (track: Track, options?: { positionSec?: number }) => void },
): boolean {
  if (!point.track) return false;
  player.play(point.track, point.positionSec === undefined ? undefined : { positionSec: point.positionSec });
  returnPointStore.clear();
  return true;
}
