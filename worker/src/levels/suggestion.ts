import type { Env } from '../env';
import { HttpError } from '../http';

export const LEVELS = ['A2', 'B1', 'B2', 'C1', 'original'] as const;
export type Level = (typeof LEVELS)[number];
export type Rating = 'too_easy' | 'just_right' | 'too_hard';
interface Feedback { level: Level; rating: Rating }

export function suggestLevel(currentLevel: Level, recent: Feedback[]) {
  const base = { currentLevel, suggestedLevel: currentLevel, changed: false };
  if (recent.length < 2) return { ...base, reason: 'insufficient_feedback', message: 'Deux retours consécutifs sont nécessaires.' };
  const [last, previous] = recent as [Feedback, Feedback];
  if (last.level !== currentLevel || previous.level !== currentLevel) {
    return { ...base, reason: 'different_levels', message: 'Les deux derniers retours ne concernent pas le niveau actuel.' };
  }
  if (last.rating === 'just_right' || last.rating !== previous.rating) {
    return { ...base, reason: 'no_streak', message: 'Les deux derniers retours ne demandent pas le même ajustement.' };
  }
  const next = LEVELS.indexOf(currentLevel) + (last.rating === 'too_easy' ? 1 : -1);
  if (next < 0 || next >= LEVELS.length) {
    return { ...base, reason: 'level_bound', message: 'Le niveau actuel est déjà à la limite de la progression.' };
  }
  return { currentLevel, suggestedLevel: LEVELS[next]!, changed: true,
    reason: last.rating === 'too_easy' ? 'two_too_easy' : 'two_too_hard',
    message: last.rating === 'too_easy'
      ? 'Deux retours « trop facile » consécutifs au niveau actuel : essayer le niveau supérieur.'
      : 'Deux retours « trop dur » consécutifs au niveau actuel : essayer le niveau inférieur.' };
}

export async function levelSuggestion(env: Env, showId: string) {
  const show = await env.DB.prepare('SELECT auto_level FROM shows WHERE id=?').bind(showId).first<{ auto_level: Level }>();
  if (!show) throw new HttpError(404, 'not_found', 'Émission inconnue.');
  const { results } = await env.DB.prepare(`SELECT level,rating FROM level_feedback
    WHERE show_id=? ORDER BY id DESC LIMIT 2`).bind(showId).all<Feedback>();
  return { showId, ...suggestLevel(show.auto_level, results) };
}
