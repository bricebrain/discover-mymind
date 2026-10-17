import { MIN_ATELIER_TOKEN_LENGTH, type Env } from '../env';
import { apiError, json } from '../http';
import { declare, state } from '../publications/declaration';
import { upload } from '../publications/upload';
import { commit } from '../publications/commit';
import { secretsEqual } from '../security/crypto';

/**
 * /atelier/* : uniquement le jeton Bearer de l'Atelier ; les cookies sont ignorés (§ 5.2).
 * La file avec bail arrive au lot 8.
 */
export async function handleAtelier(req: Request, env: Env, path: string): Promise<Response> {
  if (!env.ATELIER_TOKEN || env.ATELIER_TOKEN.length < MIN_ATELIER_TOKEN_LENGTH) {
    return apiError(503, 'misconfigured', 'Jeton Atelier absent ou trop court.');
  }
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token.length > 256 || !(await secretsEqual(env.ATELIER_TOKEN, `atelier:${token}`, `atelier:${env.ATELIER_TOKEN}`))) {
    return apiError(401, 'unauthenticated', 'Jeton Atelier invalide.', { 'WWW-Authenticate': 'Bearer' });
  }
  if (path === '/atelier/ping' && req.method === 'GET') return json({ ok: true });
  if (path === '/atelier/publications' && req.method === 'POST') return declare(req, env);
  const p = path.match(/^\/atelier\/publications\/([0-9a-f-]{36})(?:\/(commit|files\/(.+)))?$/);
  if (p?.[1]) {
    if (!p[2] && req.method === 'GET') return state(env,p[1]);
    if (p[2] === 'commit' && req.method === 'POST') return commit(env,p[1]);
    if (p[3] && req.method === 'PUT') return upload(req,env,p[1],p[3]);
  }
  return apiError(404, 'not_found', 'Route inconnue.');
}
