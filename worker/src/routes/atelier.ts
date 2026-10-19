import { MIN_ATELIER_TOKEN_LENGTH, type Env } from '../env';
import { apiError, json } from '../http';
import { declare, state } from '../publications/declaration';
import { upload } from '../publications/upload';
import { commit } from '../publications/commit';
import { secretsEqual } from '../security/crypto';
import * as leases from '../queue/leases';
import { cancel, enqueue, enqueueSource, list, removeEntry, retry } from './queue';
import { remove as removeContent } from './contents';
import * as episodes from './episodes';
import * as shows from './shows';
import * as articleFetch from './articleFetch';
import { manifest } from '../publications/store';
import type { Publication } from '../publications/types';

/**
 * /atelier/* : uniquement le jeton Bearer de l'Atelier ; les cookies sont ignorés (§ 5.2).
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
  const content = path.match(/^\/atelier\/contents\/([a-z0-9-]{3,96})\/manifest$/);
  if (content?.[1] && req.method==='GET') {
    const p = await env.DB.prepare(`SELECT p.* FROM contents c JOIN publications p ON p.id=c.current_publication_id
      WHERE c.id=? AND c.deleted_at IS NULL AND p.status='ready'`).bind(content[1]).first<Publication>();
    if (!p) return apiError(404,'not_found','Contenu introuvable.');
    return json({manifest:await manifest(env,p)});
  }
  // L'Atelier parcourt les podcasts et lance lui-même les préparations, sans passer par le téléphone.
  if (path === '/atelier/shows' && req.method === 'GET') return shows.list(env);
  // Réglages de préparation automatique depuis l'Atelier (mêmes règles que la PWA).
  const showSettings = path.match(/^\/atelier\/shows\/([a-z0-9-]{1,64})$/);
  if (showSettings?.[1] && req.method === 'PATCH') return shows.update(req, env, showSettings[1]);
  if (path === '/atelier/settings/auto-prepare' && (req.method === 'GET' || req.method === 'PUT')) return shows.autoPrepareSetting(req, env);
  if (path === '/atelier/episodes' && req.method === 'GET') return episodes.explorer(req,env);
  const prep = path.match(/^\/atelier\/episodes\/([0-9a-f]{20})\/prepare$/);
  if (prep?.[1] && req.method === 'POST') return enqueue(req,env,prep[1]);
  const manage = path.match(/^\/atelier\/queue\/([0-9a-f-]{36})\/(retry|cancel|remove)$/);
  if (manage?.[1] && req.method === 'POST') return manage[2]==='retry' ? retry(env,manage[1]) : manage[2]==='cancel' ? cancel(env,manage[1]) : removeEntry(env,manage[1]);
  const owned = path.match(/^\/atelier\/contents\/([a-z0-9-]{3,96})$/);
  if (owned?.[1] && req.method === 'DELETE') return removeContent(env,owned[1]);
  if (path === '/atelier/sources' && req.method === 'POST') return enqueueSource(req,env);
  // Récupération du texte des notes Article (l'Atelier va chercher la page, le Worker n'écrit que dans une note vide).
  if (path === '/atelier/article-fetches' && req.method === 'GET') return articleFetch.pending(env);
  const fetched = path.match(/^\/atelier\/article-fetches\/([0-9a-f-]{36})$/);
  if (fetched?.[1] && req.method === 'POST') return articleFetch.complete(req, env, fetched[1]);
  if (path === '/atelier/queue' && req.method === 'GET') return list(req,env);
  if (path === '/atelier/queue/lease' && req.method === 'POST') return leases.lease(req,env);
  const q = path.match(/^\/atelier\/queue\/([0-9a-f-]{36})\/(heartbeat|fail|release)$/);
  if (q?.[1] && q[2] && req.method === 'POST') return leases.change(req,env,q[1],q[2]);
  if (path === '/atelier/publications' && req.method === 'POST') return declare(req, env);
  const p = path.match(/^\/atelier\/publications\/([0-9a-f-]{36})(?:\/(commit|files\/(.+)))?$/);
  if (p?.[1]) {
    if (!p[2] && req.method === 'GET') return state(env,p[1]);
    if (p[2] === 'commit' && req.method === 'POST') return commit(env,p[1],req.headers.get('X-Discover-Lease-Token'));
    if (p[3] && req.method === 'PUT') return upload(req,env,p[1],p[3]);
  }
  return apiError(404, 'not_found', 'Route inconnue.');
}
