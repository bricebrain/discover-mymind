import type { Env } from '../env';
import { sha256Hex } from './crypto';

/**
 * Limitation des connexions (§ 8.2) :
 * - par IP : 5 échecs en 15 min ⇒ blocage 15 min, doublé à chaque blocage des dernières 24 h (24 h max) ;
 * - global : 20 échecs dans l'heure ⇒ connexion bloquée jusqu'à la fin de l'heure.
 */
const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX_FAILURES = 5;
const IP_BASE_LOCK_MS = 15 * 60_000;
const MAX_LOCK_MS = 24 * 3_600_000;
const GLOBAL_WINDOW_MS = 3_600_000;
const GLOBAL_MAX_FAILURES = 20;
const RETENTION_MS = 48 * 3_600_000;

const iso = (ms: number) => new Date(ms).toISOString();
const windowStart = (now: number, size: number) => iso(Math.floor(now / size) * size);

export async function ipBucket(req: Request): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  return `ip:${(await sha256Hex(`ip:${ip}`)).slice(0, 32)}`;
}

/** Fin du blocage en cours (ms) pour l'IP ou en global, ou null. */
export async function lockedUntil(env: Env, ip: string, now = Date.now()): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT MAX(locked_until) AS until FROM login_attempts
      WHERE bucket IN (?, 'global') AND locked_until > ?`,
  ).bind(ip, iso(now)).first<{ until: string | null }>();
  return row?.until ? Date.parse(row.until) : null;
}

async function bump(env: Env, bucket: string, start: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO login_attempts (bucket, window_start, failures) VALUES (?, ?, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET failures = failures + 1
     RETURNING failures`,
  ).bind(bucket, start).first<{ failures: number }>();
  return row?.failures ?? 1;
}

export async function recordFailure(env: Env, ip: string, now = Date.now()): Promise<void> {
  const ipStart = windowStart(now, IP_WINDOW_MS);
  const globalStart = windowStart(now, GLOBAL_WINDOW_MS);
  const [ipFailures, globalFailures] = await Promise.all([bump(env, ip, ipStart), bump(env, 'global', globalStart)]);

  if (ipFailures >= IP_MAX_FAILURES) {
    const prior = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
        WHERE bucket = ? AND locked_until IS NOT NULL AND window_start > ? AND window_start <> ?`,
    ).bind(ip, iso(now - MAX_LOCK_MS), ipStart).first<{ n: number }>();
    const lock = Math.min(IP_BASE_LOCK_MS * 2 ** (prior?.n ?? 0), MAX_LOCK_MS);
    await env.DB.prepare('UPDATE login_attempts SET locked_until = ? WHERE bucket = ? AND window_start = ?')
      .bind(iso(now + lock), ip, ipStart).run();
  }
  if (globalFailures >= GLOBAL_MAX_FAILURES) {
    await env.DB.prepare(`UPDATE login_attempts SET locked_until = ? WHERE bucket = 'global' AND window_start = ?`)
      .bind(iso(Date.parse(globalStart) + GLOBAL_WINDOW_MS), globalStart).run();
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?)')
    .bind(iso(now - RETENTION_MS), iso(now)).run();
}

/** Après une connexion réussie : remet à zéro les échecs de la fenêtre courante de cette IP. */
export async function clearFailures(env: Env, ip: string, now = Date.now()): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE bucket = ? AND window_start = ? AND locked_until IS NULL')
    .bind(ip, windowStart(now, IP_WINDOW_MS)).run();
}
