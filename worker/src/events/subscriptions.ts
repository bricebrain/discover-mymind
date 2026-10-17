import type { Env } from '../env';
import { HttpError,json,noContent,readJson } from '../http';
import { identity } from './identity';

const fail = ():never => {throw new HttpError(422,'invalid_subscription','Abonnement de notification invalide.');};
export function validateSubscription(value: unknown) {
  const s=value as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}}|null;
  if (!s || typeof s.endpoint!=='string' || s.endpoint.length>2048) return fail();
  let url:URL;try {url=new URL(s.endpoint);}catch{return fail();}
  // Services Push des navigateurs pris en charge. Aucune URL arbitraire n'est appelée.
  const host=url.hostname;
  if (url.protocol!=='https:' || url.username || url.password || url.port || url.hash ||
      !(host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host==='web.push.apple.com' ||
        host==='wns.windows.com' || host.endsWith('.notify.windows.com'))) return fail();
  if (!s.keys || typeof s.keys.p256dh!=='string' || typeof s.keys.auth!=='string' ||
      !/^[A-Za-z0-9_-]{87}={0,2}$/.test(s.keys.p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(s.keys.auth)) return fail();
  return {endpoint:s.endpoint,expirationTime:null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function notifications(req: Request,env: Env,path: string) {
  const who=await identity(env,req,path.endsWith('/config'));
  if(!who) throw new HttpError(401,'device_required','Rouvrir les réglages sur cet appareil.');
  const a=who.attachment;
  if(path.endsWith('/config') && req.method==='GET') {
    const row=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE id=? AND epoch=? AND session_id IS ?').bind(a.deviceId,a.epoch,a.sessionId).first();
    return json({publicKey:env.VAPID_PUBLIC_KEY ?? null,configured:!!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),enabled:!!row},200,who.cookie ? {'Set-Cookie':who.cookie} : {});
  }
  if(path.endsWith('/subscription') && req.method==='PUT') {
    if(!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new HttpError(503,'push_unconfigured','Notifications indisponibles pour le moment.');
    const s=validateSubscription(await readJson(req,4096));
    try {
      const bytes=Uint8Array.from(atob(s.keys.p256dh.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      await crypto.subtle.importKey('raw',bytes,{name:'ECDH',namedCurve:'P-256'},false,[]);
    } catch {return fail();}
    const existing=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE endpoint=? AND id<>?').bind(s.endpoint,a.deviceId).first();
    if(existing) throw new HttpError(409,'subscription_conflict','Cet abonnement appartient à un autre appareil.');
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{n:number}>();
    const own=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE id=?').bind(a.deviceId).first();
    if(!own && (count?.n ?? 0)>=10) throw new HttpError(429,'too_many_devices','Dix appareils sont déjà abonnés.');
    const now=new Date().toISOString();
    const saved=await env.DB.prepare(`INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,session_id,epoch,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM push_subscriptions WHERE id=?) OR (SELECT COUNT(*) FROM push_subscriptions)<10 ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,
      auth=excluded.auth,session_id=excluded.session_id,epoch=excluded.epoch,updated_at=excluded.updated_at`)
      .bind(a.deviceId,s.endpoint,s.keys.p256dh,s.keys.auth,a.sessionId,a.epoch,now,now,a.deviceId).run();
    if(!saved.meta.changes) throw new HttpError(429,'too_many_devices','Dix appareils sont déjà abonnés.');
    return noContent();
  }
  if(path.endsWith('/subscription') && req.method==='DELETE') {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(a.deviceId).run();return noContent();
  }
  if(path.endsWith('/test') && req.method==='POST') {
    const now=Date.now();
    const r=await env.DB.prepare(`UPDATE push_subscriptions SET last_test_at=? WHERE id=? AND epoch=? AND session_id IS ?
      AND (last_test_at IS NULL OR last_test_at<?) RETURNING id`).bind(new Date(now).toISOString(),a.deviceId,a.epoch,a.sessionId,new Date(now-60_000).toISOString()).first();
    if(!r) throw new HttpError(429,'test_unavailable','Activer les notifications ou attendre une minute avant un nouvel essai.');
    await env.DB.prepare("INSERT INTO push_deliveries(event_id,device_id,kind,next_at,expires_at) VALUES (?,?,'test',?,?)")
      .bind('test:'+crypto.randomUUID(),a.deviceId,now,now+300_000).run();return noContent();
  }
  throw new HttpError(405,'method_not_allowed','Méthode non autorisée.');
}
