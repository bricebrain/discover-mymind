import type { WeeklyMetrics } from './types';

const DAY = 86_400_000;
const paris = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});
const numbers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const dates = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

/** Même calcul ISO que le Worker, à partir de la date civile à Paris. */
export function weekKey(date = new Date()): string {
  const parts = Object.fromEntries(paris.formatToParts(date).map(p => [p.type, Number(p.value)]));
  const thursday = new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day!));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekMonday(key: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]), week = Number(match[2]);
  if (year < 2000 || year > 2099 || week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
  return weekKey(jan4) === key ? jan4 : null;
}

export function shiftWeek(key: string, offset: number): string {
  const monday = weekMonday(key);
  if (!monday) throw new Error('Semaine ISO invalide.');
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return weekKey(monday);
}

export function selectedWeek(value: string | null, current: string): string {
  return value && weekMonday(value) && value <= current ? value : current;
}

export function weekLabel(key: string): string {
  const start = weekMonday(key);
  if (!start) return key;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dates.format(start)} – ${dates.format(end)}`;
}

export const formatNumber = (value: number) => numbers.format(value);
export function formatDelta(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 'Sans changement' : `${rounded > 0 ? '+' : '−'}${numbers.format(Math.abs(rounded))}`;
}
export const isEmptyWeek = (metrics: WeeklyMetrics) => Object.values(metrics).every(value => value === 0);

export function listeningLink(targetType: 'episode' | 'variant', targetId: string): string | null {
  if (targetType === 'episode') return `/?e=${encodeURIComponent(targetId)}`;
  const separator = targetId.indexOf(':');
  if (separator < 1 || separator === targetId.length - 1) return null;
  return `/library/${encodeURIComponent(targetId.slice(0, separator))}?v=${encodeURIComponent(targetId.slice(separator + 1))}`;
}
