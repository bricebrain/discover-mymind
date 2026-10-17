import type { Env } from '../env';
import { hmacHex, randomToken } from './crypto';

export const SESSION_COOKIE = '__Host-discover_session';
const DAY_MS = 86_400_000;
export const IDLE_TTL_MS = 30 * DAY_MS;
export const ABSOLUTE_TTL_MS = 180 * DAY_MS;
/** last_seen_at n'est réécrit qu'une fois par heure au plus (économie d'écritures D1). */
const TOUCH_INTERVAL_MS = 3_600_000;

export interface Session {
  id: string;
  label: string | null;
  created_at: string;
  last_seen_at: string;
  idle_expires_at: string;
  expires_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** Libellé d'appareil lisible, dérivé du User-Agent (jamais utilisé pour décider). */
export function deviceLabel(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'navigateur';
  return `${os} · ${browser}`;
}

const sessionId = (env: Env, token: string) => hmacHex(env.SESSION_EPOCH, `session:${token}`);

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${ABSOLUTE_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function createSession(env: Env, req: Request, now = Date.now()): Promise<{ token: string; session: Session }> {
  const token = randomToken();
  const session: Session = {
    id: await sessionId(env, token),
    label: deviceLabel(req.headers.get('User-Agent')),
    created_at: iso(now),
    last_seen_at: iso(now),
    idle_expires_at: iso(now + IDLE_TTL_MS),
    expires_at: iso(now + ABSOLUTE_TTL_MS),
  };
  await env.DB.prepare(
    `INSERT INTO sessions (id, label, created_at, last_seen_at, idle_expires_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(session.id, session.label, session.created_at, session.last_seen_at, session.idle_expires_at, session.expires_at).run();
  return { token, session };
}

/** Session valide de la requête, ou null (absente, inconnue, révoquée, expirée ou d'une autre époque). */
export async function getSession(env: Env, req: Request, now = Date.now()): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  const id = await sessionId(env, token);
  const nowIso = iso(now);
  const session = await env.DB.prepare(
    `SELECT id, label, created_at, last_seen_at, idle_expires_at, expires_at FROM sessions
      WHERE id = ? AND revoked_at IS NULL AND idle_expires_at > ? AND expires_at > ?`,
  ).bind(id, nowIso, nowIso).first<Session>();
  if (!session) return null;
  if (now - Date.parse(session.last_seen_at) >= TOUCH_INTERVAL_MS) {
    const idle = iso(Math.min(now + IDLE_TTL_MS, Date.parse(session.expires_at)));
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?')
      .bind(nowIso, idle, id).run();
    session.last_seen_at = nowIso;
    session.idle_expires_at = idle;
  }
  return session;
}

export async function listSessions(env: Env, now = Date.now()): Promise<Session[]> {
  const nowIso = iso(now);
  const { results } = await env.DB.prepare(
    `SELECT id, label, created_at, last_seen_at, idle_expires_at, expires_at FROM sessions
      WHERE revoked_at IS NULL AND idle_expires_at > ? AND expires_at > ?
      ORDER BY last_seen_at DESC`,
  ).bind(nowIso, nowIso).all<Session>();
  return results;
}

export async function revokeSession(env: Env, id: string, now = Date.now()): Promise<boolean> {
  const r = await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(iso(now), id).run();
  return r.meta.changes > 0;
}

export async function revokeOtherSessions(env: Env, keepId: string, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id <> ? AND revoked_at IS NULL')
    .bind(iso(now), keepId).run();
  return r.meta.changes;
}
