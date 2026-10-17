import { MIN_PASSPHRASE_LENGTH, type Env } from '../env';
import { apiError, HttpError, json, noContent, readJson } from '../http';
import { secretsEqual } from '../security/crypto';
import { clearFailures, ipBucket, lockedUntil, recordFailure } from '../security/rateLimit';
import {
  clearedSessionCookie, createSession, listSessions, revokeOtherSessions, revokeSession, sessionCookie, type Session,
} from '../security/session';

const delay = (env: Env) => {
  const ms = Number(env.LOGIN_DELAY_MS ?? '400');
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
};

/**
 * Forme canonique d'une phrase : Unicode NFC et espaces de début et de fin retirés.
 * Le clavier du téléphone et le terminal du Mac peuvent produire des accents
 * composés différemment, ou ajouter une espace finale.
 */
export const normalizePassphrase = (value: string) => value.normalize('NFC').trim();

const publicSession = (s: Session, currentId?: string) => ({
  id: s.id, label: s.label, createdAt: s.created_at, lastSeenAt: s.last_seen_at,
  expiresAt: s.expires_at, current: s.id === currentId,
});

/** POST /api/auth/login — { passphrase } → nouvelle session. */
export async function login(req: Request, env: Env): Promise<Response> {
  if (!env.APP_PASSPHRASE || env.APP_PASSPHRASE.length < MIN_PASSPHRASE_LENGTH || !env.SESSION_EPOCH) {
    return apiError(503, 'misconfigured', 'Connexion indisponible : secrets du Worker absents ou trop faibles.');
  }
  const body = await readJson<{ passphrase?: unknown }>(req, 1024);
  if (typeof body.passphrase !== 'string' || body.passphrase.length === 0 || body.passphrase.length > 512) {
    throw new HttpError(400, 'invalid_body', 'Phrase secrète attendue.');
  }

  const ip = await ipBucket(req);
  const until = await lockedUntil(env, ip);
  if (until) {
    await delay(env);
    const retry = Math.max(1, Math.ceil((until - Date.now()) / 1000));
    return apiError(429, 'too_many_attempts', 'Trop de tentatives. Réessaie plus tard.', { 'Retry-After': String(retry) });
  }

  const submitted = normalizePassphrase(body.passphrase);
  const expected = normalizePassphrase(env.APP_PASSPHRASE);
  const ok = await secretsEqual(env.SESSION_EPOCH, `pass:${submitted}`, `pass:${expected}`);
  await delay(env);
  if (!ok) {
    await recordFailure(env, ip);
    return apiError(401, 'invalid_credentials', 'Phrase secrète incorrecte.');
  }
  await clearFailures(env, ip);
  const { token, session } = await createSession(env, req);
  return json({ session: publicSession(session, session.id) }, 200, { 'Set-Cookie': sessionCookie(token) });
}

/** POST /api/auth/logout — révoque la session courante. */
export async function logout(env: Env, session: Session): Promise<Response> {
  await revokeSession(env, session.id);
  return noContent({ 'Set-Cookie': clearedSessionCookie() });
}

/** GET /api/auth/session */
export function current(session: Session): Response {
  return json({ session: publicSession(session, session.id) });
}

/** GET /api/auth/sessions */
export async function list(env: Env, session: Session): Promise<Response> {
  const sessions = await listSessions(env);
  return json({ sessions: sessions.map((s) => publicSession(s, session.id)) });
}

/** DELETE /api/auth/sessions/:id */
export async function revokeOne(env: Env, session: Session, id: string): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(id)) return apiError(404, 'not_found', 'Session inconnue.');
  const revoked = await revokeSession(env, id);
  if (!revoked) return apiError(404, 'not_found', 'Session inconnue.');
  return noContent(id === session.id ? { 'Set-Cookie': clearedSessionCookie() } : {});
}

/** POST /api/auth/sessions/revoke-others */
export async function revokeOthers(env: Env, session: Session): Promise<Response> {
  return json({ revoked: await revokeOtherSessions(env, session.id) });
}
