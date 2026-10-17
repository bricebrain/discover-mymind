import { MIN_ATELIER_TOKEN_LENGTH, type Env } from '../env';
import { apiError, json } from '../http';
import { secretsEqual } from '../security/crypto';

/**
 * /atelier/* : uniquement le jeton Bearer de l'Atelier ; les cookies sont ignorés (§ 5.2).
 * Lot 1 : seul /atelier/ping existe ; la file et la publication arrivent aux lots 6 et 8.
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
  return apiError(404, 'not_found', 'Route inconnue.');
}
