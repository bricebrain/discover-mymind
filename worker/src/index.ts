import { authDisabled, type Env } from './env';
import { apiError, HttpError, json, noContent, withSecurityHeaders } from './http';
import { collectNext } from './collector';
import * as auth from './routes/auth';
import * as episodes from './routes/episodes';
import * as progress from './routes/progress';
import * as reflections from './routes/reflections';
import * as shows from './routes/shows';
import { getTranscript } from './routes/transcripts';
import { handleAtelier } from './routes/atelier';
import { assertSameOriginWrite } from './security/csrf';
import { getSession } from './security/session';

async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  assertSameOriginWrite(req);

  const m = req.method;

  if (authDisabled(env)) {
    // Accès libre : pas de session. La PWA saute l'écran de connexion.
    if (path === '/api/auth/session' || path === '/api/auth/login') return json({ session: null, authDisabled: true });
    if (path === '/api/auth/logout') return noContent();
    if (path === '/api/auth/sessions') return json({ sessions: [], authDisabled: true });
    if (path.startsWith('/api/auth/')) return apiError(404, 'not_found', 'Connexion désactivée.');
    return handleData(req, env, path, m);
  }

  if (path === '/api/auth/login') {
    return m === 'POST' ? auth.login(req, env) : apiError(405, 'method_not_allowed', 'Méthode non autorisée.');
  }

  const session = await getSession(env, req);
  if (!session) return apiError(401, 'unauthenticated', 'Connexion requise.');

  if (path === '/api/auth/session' && m === 'GET') return auth.current(session);
  if (path === '/api/auth/logout' && m === 'POST') return auth.logout(env, session);
  if (path === '/api/auth/sessions' && m === 'GET') return auth.list(env, session);
  if (path === '/api/auth/sessions/revoke-others' && m === 'POST') return auth.revokeOthers(env, session);
  const one = path.match(/^\/api\/auth\/sessions\/([^/]+)$/);
  if (one?.[1] && m === 'DELETE') return auth.revokeOne(env, session, one[1]);

  return handleData(req, env, path, m);
}

/** Routes de données (émissions, épisodes, progression) : la session est vérifiée avant. */
async function handleData(req: Request, env: Env, path: string, m: string): Promise<Response> {
  if (path === '/api/shows' && m === 'GET') return shows.list(env);
  if (path === '/api/shows' && m === 'POST') return shows.create(req, env);
  if (path === '/api/shows/resolve' && m === 'POST') return shows.resolve(req);
  if (path === '/api/shows/preview' && m === 'POST') return shows.preview(req);
  const show = path.match(/^\/api\/shows\/([a-z0-9-]{1,64})$/);
  if (show?.[1] && m === 'PATCH') return shows.update(req, env, show[1]);
  if (show?.[1] && m === 'DELETE') return shows.remove(env, show[1]);

  if (path === '/api/progress' && m === 'PUT') return progress.save(req, env);
  const pr = path.match(/^\/api\/progress\/(episode|variant)\/([^/]+)$/);
  if (pr?.[1] && pr[2] && m === 'GET') return progress.get(req, env, pr[1], decodeURIComponent(pr[2]));

  if (path === '/api/reflections' && m === 'GET') return reflections.list(req, env);
  if (path === '/api/reflections' && m === 'POST') return reflections.create(req, env);
  const rf = path.match(/^\/api\/reflections\/([0-9a-f-]{36})(\/restore)?$/);
  if (rf?.[1] && !rf[2] && m === 'GET') return reflections.get(env, rf[1]);
  if (rf?.[1] && !rf[2] && m === 'PATCH') return reflections.update(req, env, rf[1]);
  if (rf?.[1] && !rf[2] && m === 'DELETE') return reflections.trash(env, rf[1]);
  if (rf?.[1] && rf[2] && m === 'POST') return reflections.restore(env, rf[1]);
  if (path === '/api/export' && m === 'GET') return reflections.exportAll(env);

  if (path === '/api/explorer' && m === 'GET') return episodes.explorer(req, env);
  const ep = path.match(/^\/api\/episodes\/([0-9a-f]{20})(\/state|\/transcript)?$/);
  if (ep?.[1] && !ep[2] && m === 'GET') return episodes.detail(env, ep[1]);
  if (ep?.[1] && ep[2] === '/state' && m === 'POST') return episodes.setState(req, env, ep[1]);
  if (ep?.[1] && ep[2] === '/transcript' && m === 'GET') return getTranscript(env, ep[1]);

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

  /** Cron toutes les minutes : une émission vérifiée par exécution (§ 7.1). */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const r = await collectNext(env);
    if (r.status !== 'idle') console.log(JSON.stringify({ event: 'collect', ...r }));
    // Corbeille de My Mind : une fois par heure suffit (minute 7).
    if (new Date().getUTCMinutes() === 7) await reflections.purgeTrash(env);
  },
} satisfies ExportedHandler<Env>;
