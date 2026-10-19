import { useSyncExternalStore } from 'react';

/**
 * I5 — minuterie de sommeil : 15 / 30 / 45 minutes ou « fin de l'épisode ».
 * « Fin de l'épisode » n'a pas d'échéance horloge : elle s'arrête avec la piste en cours.
 */
export type SleepChoice = 15 | 30 | 45 | 'end';
export interface SleepState { mode: SleepChoice; endsAt: number | null }

export const SLEEP_CHOICES: readonly { value: SleepChoice; label: string }[] = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 'end', label: 'Fin de l’épisode' },
];

/** Échéance d'un choix : les minutes comptent dès maintenant ; « fin de l'épisode » dépend de la piste. */
export function sleepEndsAt(choice: SleepChoice, nowMs: number): number | null {
  return choice === 'end' ? null : nowMs + choice * 60_000;
}

/** Secondes restantes avant l'arrêt ; null quand la minuterie ne dépend pas de l'horloge. */
export function sleepRemainingSec(state: SleepState | null, nowMs: number): number | null {
  if (!state || state.endsAt === null) return null;
  return Math.max(0, Math.ceil((state.endsAt - nowMs) / 1000));
}

/** Une minuterie à durée arrête la lecture dès que l'échéance est atteinte ou dépassée. */
export function sleepElapsed(state: SleepState | null, nowMs: number): boolean {
  return !!state && state.endsAt !== null && nowMs >= state.endsAt;
}

/** La minuterie prime toujours sur la lecture suivante, y compris à l'échéance exacte. */
export function endOfTrackAction(state: SleepState | null, autoplay: boolean, nowMs: number): 'stop' | 'next' | 'none' {
  if (state?.mode === 'end' || sleepElapsed(state, nowMs)) return 'stop';
  return autoplay ? 'next' : 'none';
}

type Listener = () => void;
const listeners = new Set<Listener>();
let state: SleepState | null = null;

/** Minuterie de la session : un seul choix à la fois, visible par le lecteur et annulable. */
export const sleepStore = {
  start(choice: SleepChoice, now: () => number = Date.now) {
    state = { mode: choice, endsAt: sleepEndsAt(choice, now()) };
    for (const l of listeners) l();
  },
  cancel() {
    if (!state) return;
    state = null;
    for (const l of listeners) l();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: () => state,
};

export function useSleep(): SleepState | null {
  return useSyncExternalStore(sleepStore.subscribe, sleepStore.getSnapshot, sleepStore.getSnapshot);
}
