import { HttpError } from '../http';

const DAY = 86_400_000;
export const TIME_ZONE = 'Europe/Paris';
const paris = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function localParts(date: Date): Record<string, number> {
  return Object.fromEntries(paris.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}

/** Minuit local du lundi : les bornes sont converties séparément pour respecter le changement d'heure. */
function midnight(local: number): string {
  let utc = local;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(utc));
    utc += local - Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  }
  return new Date(utc).toISOString();
}

export function weekKey(date = new Date()): string {
  const p = localParts(date);
  const thursday = new Date(Date.UTC(p.year!, p.month! - 1, p.day!));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekRange(value: string | null, previous = false) {
  const key = value ?? weekKey();
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  const year = Number(match?.[1]), week = Number(match?.[2]);
  if (!match || year < (previous ? 1999 : 2000) || year > 2099 || week < 1 || week > 53) invalidWeek();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (week - 1) * 7 * DAY;
  const start = midnight(monday), end = midnight(monday + 7 * DAY);
  if (weekKey(new Date(start)) !== key) invalidWeek();
  return { week: key, timeZone: TIME_ZONE, start, end, previousWeek: weekKey(new Date(midnight(monday - 7 * DAY))) };
}

function invalidWeek(): never {
  throw new HttpError(400, 'invalid_week', 'Semaine ISO attendue : YYYY-Www, entre 2000 et 2099.');
}
