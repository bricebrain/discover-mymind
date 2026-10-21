import { HttpError } from '../http';

export interface PrepareOptions {
  /** guided : original guidé (source anglaise telle quelle, source française traduite et lue en entier). */
  coverage: 'full' | 'condensed' | 'essentials' | 'guided';
  level: 'A2' | 'B1' | 'B2' | 'C1' | 'original';
  style: 'narration' | 'dialogue';
  targetMinutes: number | null;
  faithful: boolean;
  keepOriginalCopy: boolean;
}

export function prepareOptions(value: unknown, language: string, durationSec: number | null): PrepareOptions {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  const b = value as Record<string, unknown>;
  const allowed = ['coverage', 'level', 'style', 'targetMinutes', 'faithful', 'keepOriginalCopy'];
  if (Object.keys(b).some((k) => !allowed.includes(k))) invalid();
  const coverage = b.coverage === undefined ? (durationSec !== null && durationSec > 1500 ? 'condensed' : 'full') : b.coverage;
  const level = b.level === undefined ? 'B1' : b.level, style = b.style === undefined ? 'narration' : b.style;
  if (coverage !== 'full' && coverage !== 'condensed' && coverage !== 'essentials' && coverage !== 'guided') invalid();
  if (level !== 'A2' && level !== 'B1' && level !== 'B2' && level !== 'C1' && level !== 'original') invalid();
  if (style !== 'narration' && style !== 'dialogue') invalid();
  // Original guidé : le niveau règle les explications du guide, jamais le texte ; pas de durée cible.
  if (coverage === 'guided' && (level === 'original' || style !== 'narration')) invalid();
  const targetMinutes = b.targetMinutes === undefined ? (coverage === 'condensed' ? 12 : coverage === 'essentials' ? 4 : null) : b.targetMinutes;
  if (targetMinutes !== null && typeof targetMinutes !== 'number') invalid();
  if (coverage === 'full' || coverage === 'guided' ? targetMinutes !== null :
    typeof targetMinutes !== 'number' || !Number.isInteger(targetMinutes) ||
      targetMinutes < (coverage === 'condensed' ? 8 : 3) || targetMinutes > (coverage === 'condensed' ? 20 : 6)) invalid();
  const faithful = b.faithful === undefined ? false : b.faithful;
  const keepOriginalCopy = b.keepOriginalCopy === undefined ? false : b.keepOriginalCopy;
  if (typeof faithful !== 'boolean' || typeof keepOriginalCopy !== 'boolean' || (faithful && language !== 'fr')) invalid();
  return { coverage, level, style, targetMinutes, faithful, keepOriginalCopy };
}
function invalid(): never { throw new HttpError(422, 'invalid_options', 'Options de préparation invalides.'); }
