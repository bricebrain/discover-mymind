import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LevelSuggestion } from '../levels/types';
import { ignoreLevel, ignoredLevelKey, isLevelIgnored, shouldOfferLevel, suggestedLevelLabel } from './suggestionLogic';

const suggestion: LevelSuggestion = {
  showId: 'podcast', currentLevel: 'B1', suggestedLevel: 'B2', changed: true,
  reason: 'two_too_easy', message: 'Deux retours trop facile.',
};
afterEach(() => vi.unstubAllGlobals());

describe('visibilité de la suggestion', () => {
  it('propose uniquement un changement cohérent avec le réglage courant', () => {
    expect(shouldOfferLevel(suggestion, 'podcast', 'B1', false)).toBe(true);
    expect(shouldOfferLevel(undefined, 'podcast', 'B1', false)).toBe(false);
    expect(shouldOfferLevel({ ...suggestion, changed: false }, 'podcast', 'B1', false)).toBe(false);
    expect(shouldOfferLevel(suggestion, 'autre', 'B1', false)).toBe(false);
    expect(shouldOfferLevel(suggestion, 'podcast', 'A2', false)).toBe(false);
    expect(shouldOfferLevel(suggestion, 'podcast', 'B2', false)).toBe(false);
    expect(shouldOfferLevel({ ...suggestion, suggestedLevel: 'B1' }, 'podcast', 'B1', false)).toBe(false);
    expect(shouldOfferLevel(suggestion, 'podcast', 'B1', true)).toBe(false);
  });

  it('affiche les paliers inférieur et original sans inventer C2', () => {
    expect(suggestedLevelLabel('B2')).toBe('Essayer B2 ?');
    expect(suggestedLevelLabel('original')).toBe('Essayer l’original ?');
    expect(shouldOfferLevel({ ...suggestion, suggestedLevel: 'A2', reason: 'two_too_hard' }, 'podcast', 'B1', false)).toBe(true);
  });
});

describe('refus local par émission et par niveau', () => {
  it('persiste sans masquer les autres émissions ou les autres niveaux', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) });
    expect(isLevelIgnored('podcast', 'B2')).toBe(false);
    ignoreLevel('podcast', 'B2');
    expect(isLevelIgnored('podcast', 'B2')).toBe(true);
    expect(isLevelIgnored('autre', 'B2')).toBe(false);
    expect(isLevelIgnored('podcast', 'C1')).toBe(false);
    expect(ignoredLevelKey('a:B2', 'C1')).not.toBe(ignoredLevelKey('a', 'B2'));
    expect(shouldOfferLevel(suggestion, 'podcast', 'B1', isLevelIgnored('podcast', 'B2'))).toBe(false);
  });

  it('supporte un stockage bloqué à la lecture comme à l’écriture', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('interdit'); },
      setItem: () => { throw new Error('quota'); } });
    expect(isLevelIgnored('podcast', 'B2')).toBe(false);
    expect(() => ignoreLevel('podcast', 'B2')).not.toThrow();
  });

  it('supporte un navigateur sans localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(isLevelIgnored('podcast', 'B2')).toBe(false);
    expect(() => ignoreLevel('podcast', 'B2')).not.toThrow();
  });
});
