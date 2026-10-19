import { flushEvents,cleanupEvents } from './events/hub';
import { identity } from './events/identity';
import { notifications } from './events/subscriptions';
export { PreparationEvents } from './events/hub';
import { authDisabled, type Env } from './env';
import { apiError, HttpError, json, noContent, withSecurityHeaders } from './http';
import { cleanupPublications } from './publications/cleanup';
import * as contents from './routes/contents';
import { exportData } from './routes/export';
import { collectNext } from './collector';
import * as auth from './routes/auth';
import * as episodes from './routes/episodes';
import * as progress from './routes/progress';
import * as queue from './routes/queue';
import { route as dossierRoute } from './dossiers/routes';
import { candidates } from './dossiers/candidates';
import { expireExhausted } from './queue/store';
import * as reflections from './routes/reflections';
import * as articleFetch from './routes/articleFetch';
import * as articles from './articles/routes';
import { collectArticles } from './articles/collect';
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
  if (path==='/api/dossier-sources' && m==='GET') return candidates(req,env);
  if (path.startsWith('/api/dossiers')) { const response=await dossierRoute(req,env,path); if(response) return response; }
  if (path === '/api/sources/youtube' && m === 'POST') return queue.enqueueYoutube(req,env);
  if (path.startsWith('/api/notifications/')) return notifications(req,env,path);
  if (path === '/api/events' && m==='GET') {
    if(req.headers.get('Origin')!==new URL(req.url).origin) throw new HttpError(403,'csrf_origin','Origine refusée.');
    if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket') throw new HttpError(426,'upgrade_required','Connexion WebSocket requise.');
    const who=await identity(env,req);
    if(!who) throw new HttpError(401,'device_required','Appareil inconnu.');
    const headers=new Headers(req.headers);headers.delete('Cookie');headers.delete('Authorization');
    headers.set('X-Discover-Identity',JSON.stringify(who.attachment));
    return env.EVENTS.getByName('personal-library').fetch(new Request(req,{headers}));
  }
  if (path === '/api/queue' && m === 'GET') return queue.list(req,env);
  const queued = path.match(/^\/api\/queue\/([0-9a-f-]{36})(?:\/(retry|remove))?$/);
  if (queued?.[1] && !queued[2] && m === 'DELETE') return queue.cancel(env,queued[1]);
  if (queued?.[1] && queued[2]==='retry' && m === 'POST') return queue.retry(env,queued[1]);
  if (queued?.[1] && queued[2]==='remove' && m === 'POST') return queue.removeEntry(env,queued[1]);
  const prepare = path.match(/^\/api\/episodes\/([0-9a-f]{20})\/prepare$/);
  if (prepare?.[1] && m === 'POST') return queue.enqueue(req,env,prepare[1]);
  if (path === '/api/library' && m === 'GET') return contents.library(req,env);
  const content = path.match(/^\/api\/contents\/([a-z0-9-]{3,96})(?:\/variants\/([a-z0-9-]{2,32})\/(segments|audio))?$/);
  if (content?.[1] && !content[2] && m === 'DELETE') return contents.remove(env,content[1]);
  if (content?.[1] && m === 'GET') {
    if (!content[2]) return contents.detail(env,content[1]);
    return contents.media(req,env,content[1],content[2],content[3]!);
  }
  if (path === '/api/shows' && m === 'GET') return shows.list(env);
  if (path === '/api/settings/auto-prepare' && (m === 'GET' || m === 'PUT')) return shows.autoPrepareSetting(req, env);
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
  if (path === '/api/articles' && m === 'GET') return articles.list(req, env);
  const art = path.match(/^\/api\/articles\/([0-9a-f]{20})(?:\/(fetch|note))?$/);
  if (art?.[1] && !art[2] && m === 'GET') return articles.detail(env, art[1]);
  if (art?.[1] && art[2] === 'fetch' && m === 'POST') return articles.requestFetch(env, art[1]);
  if (art?.[1] && art[2] === 'note' && m === 'POST') return articles.toNote(req, env, art[1]);
  const rfFetch = path.match(/^\/api\/reflections\/([0-9a-f-]{36})\/fetch$/);
  if (rfFetch?.[1] && m === 'POST') return articleFetch.request(env, rfFetch[1]);
  const rfPrepare = path.match(/^\/api\/reflections\/([0-9a-f-]{36})\/prepare$/);
  if (rfPrepare?.[1] && m === 'POST') return queue.enqueueReflection(req,env,rfPrepare[1]);
  // Export historique par défaut ; ?v=2 : export complet, ?v=2&format=markdown : document seul.
  if (path === '/api/export' && m === 'GET') return exportData(req, env);

  if (path === '/api/explorer' && m === 'GET') return episodes.explorer(req, env);
  const ep = path.match(/^\/api\/episodes\/([0-9a-f]{20})(\/state|\/transcript)?$/);
  if (ep?.[1] && !ep[2] && m === 'GET') return episodes.detail(env, ep[1]);
  if (ep?.[1] && ep[2] === '/state' && m === 'POST') return episodes.setState(req, env, ep[1]);
  if (ep?.[1] && ep[2] === '/transcript' && m === 'GET') return getTranscript(env, ep[1]);

  return apiError(404, 'not_found', 'Route inconnue.');
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      if (path.startsWith('/api/') || path.startsWith('/atelier/')) {
        try {
          const response=path.startsWith('/api/') ? await handleApi(req,env,path) : await handleAtelier(req,env,path);
          return response.status===101 ? response : withSecurityHeaders(response);
        } finally {
          if(req.method!=='GET' && req.method!=='HEAD' || path==='/api/queue' || path==='/atelier/queue') ctx.waitUntil(flushEvents(env));
        }
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return withSecurityHeaders(apiError(e.status, e.code, e.message));
      console.error(JSON.stringify({ event: 'unhandled_error', path, message: e instanceof Error ? e.message : String(e) }));
      return withSecurityHeaders(apiError(500, 'internal_error', 'Erreur interne.'));
    }
  },

  /** Cron toutes les minutes : une émission vérifiée par exécution (§ 7.1). */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await expireExhausted(env);
    const r = await collectNext(env);
    if (r.status !== 'idle') console.log(JSON.stringify({ event: 'collect', ...r }));
    await flushEvents(env);
    if (new Date().getUTCMinutes()===27) await cleanupEvents(env);
    // Corbeille de My Mind : une fois par heure suffit (minute 7).
    if (new Date().getUTCMinutes() === 7) await reflections.purgeTrash(env);
    if (new Date().getUTCMinutes() === 17) await cleanupPublications(env);
    // Articles : une source vérifiée tous les quarts d'heure (chacune environ une fois par heure).
    if (new Date().getUTCMinutes() % 15 === 3) {
      const a = await collectArticles(env);
      if (a.status !== 'idle') console.log(JSON.stringify({ event: 'collect_articles', ...a }));
    }
  },
} satisfies ExportedHandler<Env>;
