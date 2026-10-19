import type { AutoLevel } from '../api/shows';
import type { LevelSuggestion } from '../levels/types';

export const ignoredLevelKey = (showId: string, level: AutoLevel) =>
  `discover:ignored-level:${encodeURIComponent(showId)}:${level}`;

export function isLevelIgnored(showId: string, level: AutoLevel): boolean {
  try {
    return localStorage.getItem(ignoredLevelKey(showId, level)) === '1';
  } catch {
    return false;
  }
}

export function ignoreLevel(showId: string, level: AutoLevel): void {
  try {
    localStorage.setItem(ignoredLevelKey(showId, level), '1');
  } catch {
    // Le hook conserve aussi le refus en mémoire lorsque le stockage est indisponible.
  }
}

export function shouldOfferLevel(
  suggestion: LevelSuggestion | undefined, showId: string, currentLevel: AutoLevel, ignored: boolean,
): suggestion is LevelSuggestion {
  return !!suggestion && suggestion.changed && suggestion.showId === showId
    && suggestion.currentLevel === currentLevel && suggestion.suggestedLevel !== currentLevel && !ignored;
}

export function suggestedLevelLabel(level: AutoLevel): string {
  return level === 'original' ? 'Essayer l’original ?' : `Essayer ${level} ?`;
}
