import type { Env } from '../env';
import { authDisabled } from '../env';
import { hmacHex, randomToken } from '../security/crypto';
import { getSession } from '../security/session';

const COOKIE = '__Host-discover_device';
export interface EventIdentity { deviceId: string; sessionId: string | null; epoch: string; expires: number; role?: 'atelier' }
export const eventEpoch = (env: Env) => hmacHex(env.SESSION_EPOCH,'events:epoch');
const atelierEpoch = (env: Env) => hmacHex(env.ATELIER_TOKEN,'events:atelier');

/** Appelé uniquement après validation du Bearer, jamais depuis un en-tête fourni par le client. */
export async function atelierIdentity(env: Env): Promise<EventIdentity> {
  return { deviceId: `atelier:${crypto.randomUUID()}`, sessionId: null, role: 'atelier',
    epoch: await atelierEpoch(env), expires: Date.now() + 3_600_000 };
}

export async function identity(env: Env, req: Request, create = false) {
  const session = authDisabled(env) ? null : await getSession(env,req);
  if (!authDisabled(env) && !session) return null;
  const token = req.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  const valid = token && /^[A-Za-z0-9_-]{32,128}$/.test(token);
  if (!valid && !create) return null;
  const value = valid ? token : randomToken();
  return { attachment: {deviceId:await hmacHex(env.SESSION_EPOCH,'device:'+value),sessionId:session?.id ?? null,
    epoch:await eventEpoch(env), expires:Math.min(Date.now()+3_600_000,session ? Date.parse(session.idle_expires_at) : Infinity)} satisfies EventIdentity,
    cookie:!valid ? `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=15552000` : null };
}
export async function validIdentity(env: Env, identity: EventIdentity) {
  if (identity.role === 'atelier') {
    return identity.expires > Date.now() && identity.epoch === await atelierEpoch(env);
  }
  if (identity.expires<=Date.now() || identity.epoch!==await eventEpoch(env)) return false;
  if (authDisabled(env)) return true;
  if (!identity.sessionId) return false;
  const at = new Date().toISOString();
  return !!await env.DB.prepare('SELECT id FROM sessions WHERE id=? AND revoked_at IS NULL AND idle_expires_at>? AND expires_at>?')
    .bind(identity.sessionId,at,at).first();
}
