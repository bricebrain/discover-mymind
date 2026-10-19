import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOfTrackAction, sleepElapsed, sleepEndsAt, sleepRemainingSec, sleepStore } from './sleep';

afterEach(() => sleepStore.cancel());

describe('échéances de la minuterie', () => {
  it('15, 30 et 45 minutes comptent depuis maintenant', () => {
    const now = 1_000_000;
    expect(sleepEndsAt(15, now)).toBe(now + 15 * 60_000);
    expect(sleepEndsAt(30, now)).toBe(now + 30 * 60_000);
    expect(sleepEndsAt(45, now)).toBe(now + 45 * 60_000);
  });
  it('« fin de l’épisode » ne dépend pas de l’horloge', () => {
    expect(sleepEndsAt('end', 1_000_000)).toBeNull();
  });
});

describe('compte à rebours', () => {
  it('arrondit à la seconde supérieure et ne descend pas sous zéro', () => {
    const state = { mode: 15 as const, endsAt: 100_000 };
    expect(sleepRemainingSec(state, 90_000)).toBe(10);
    expect(sleepRemainingSec(state, 90_500)).toBe(10);
    expect(sleepRemainingSec(state, 100_000)).toBe(0);
    expect(sleepRemainingSec(state, 500_000)).toBe(0);
  });
  it('rien à compter sans minuterie ou pour « fin de l’épisode »', () => {
    expect(sleepRemainingSec(null, 0)).toBeNull();
    expect(sleepRemainingSec({ mode: 'end', endsAt: null }, 0)).toBeNull();
  });
});

describe('déclenchement', () => {
  it('échoit seulement après l’échéance, jamais pour « fin de l’épisode »', () => {
    expect(sleepElapsed({ mode: 15, endsAt: 100 }, 99)).toBe(false);
    expect(sleepElapsed({ mode: 15, endsAt: 100 }, 100)).toBe(true);
    expect(sleepElapsed({ mode: 15, endsAt: 100 }, 600)).toBe(true);
    expect(sleepElapsed({ mode: 'end', endsAt: null }, 1e9)).toBe(false);
    expect(sleepElapsed(null, 1e9)).toBe(false);
  });
});

describe('minuterie de la session', () => {
  it('un seul choix actif à la fois, remplacé ou annulé, avec notification', () => {
    const heard = vi.fn();
    const unlisten = sleepStore.subscribe(heard);
    sleepStore.start(30, () => 5_000);
    expect(sleepStore.getSnapshot()).toEqual({ mode: 30, endsAt: 30 * 60_000 + 5_000 });
    sleepStore.start('end', () => 9_000);
    expect(sleepStore.getSnapshot()).toEqual({ mode: 'end', endsAt: null });
    sleepStore.cancel();
    expect(sleepStore.getSnapshot()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(3);
    unlisten();
  });
});


describe('fin de piste et priorité de la minuterie', () => {
  it('arrête à la fin de l’épisode même quand l’enchaînement est actif', () => {
    expect(endOfTrackAction({ mode: 'end', endsAt: null }, true, 10)).toBe('stop');
  });
  it('bloque aussi l’enchaînement si l’échéance vient de passer', () => {
    expect(endOfTrackAction({ mode: 15, endsAt: 100 }, true, 100)).toBe('stop');
    expect(endOfTrackAction({ mode: 15, endsAt: 100 }, true, 101)).toBe('stop');
  });
  it('enchaîne avant l’échéance et respecte la désactivation ou l’annulation', () => {
    expect(endOfTrackAction({ mode: 15, endsAt: 100 }, true, 99)).toBe('next');
    expect(endOfTrackAction(null, false, 100)).toBe('none');
    sleepStore.start('end');
    sleepStore.cancel();
    expect(endOfTrackAction(sleepStore.getSnapshot(), true, 100)).toBe('next');
  });
});
