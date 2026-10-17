import type { Env } from './env';
import { apiError, HttpError, withSecurityHeaders } from './http';
import * as auth from './routes/auth';
import { handleAtelier } from './routes/atelier';
import { assertSameOriginWrite } from './security/csrf';
import { getSession } from './security/session';

async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  assertSameOriginWrite(req);

  if (path === '/api/auth/login') {
    return req.method === 'POST' ? auth.login(req, env) : apiError(405, 'method_not_allowed', 'Méthode non autorisée.');
  }

  const session = await getSession(env, req);
  if (!session) return apiError(401, 'unauthenticated', 'Connexion requise.');

  const m = req.method;
  if (path === '/api/auth/session' && m === 'GET') return auth.current(session);
  if (path === '/api/auth/logout' && m === 'POST') return auth.logout(env, session);
  if (path === '/api/auth/sessions' && m === 'GET') return auth.list(env, session);
  if (path === '/api/auth/sessions/revoke-others' && m === 'POST') return auth.revokeOthers(env, session);
  const one = path.match(/^\/api\/auth\/sessions\/([^/]+)$/);
  if (one?.[1] && m === 'DELETE') return auth.revokeOne(env, session, one[1]);

  return apiError(404, 'not_found', 'Route inconnue.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      if (path.startsWith('/api/')) return withSecurityHeaders(await handleApi(req, env, path));
      if (path.startsWith('/atelier/')) return withSecurityHeaders(await handleAtelier(req, env, path));
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return withSecurityHeaders(apiError(e.status, e.code, e.message));
      console.error(JSON.stringify({ event: 'unhandled_error', path, message: e instanceof Error ? e.message : String(e) }));
      return withSecurityHeaders(apiError(500, 'internal_error', 'Erreur interne.'));
    }
  },
} satisfies ExportedHandler<Env>;
