import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { Env } from '../env';
import { validIdentity } from './identity';
import { validateSubscription } from './subscriptions';

export type NotificationKind='ready'|'review'|'failed'|'test';
interface Delivery {
  event_id:string;device_id:string;kind:NotificationKind;attempts:number;expires_at:number;
  endpoint:string;p256dh:string;auth:string;session_id:string|null;epoch:string;
}
export function notificationMessage(kind:NotificationKind,eventId:string) {
  const bodies={ready:'Une préparation est prête dans Discover.',review:'Une version attend ta relecture dans l’Atelier sur le Mac.',
    failed:'Une préparation a échoué. Ouvre Discover pour la relancer.',test:'Les notifications fonctionnent sur cet appareil.'};
  return {title:'Discover',body:bodies[kind],tag:'discover-'+eventId,url:kind==='test'?'/settings':'/library'};
}

/** Envois bornés, chiffrés ; jamais de titre d'épisode, de texte ou de secret dans le message. */
export async function deliverPush(env:Env,visible:Set<string>,transport:typeof fetch=fetch) {
  await env.DB.prepare('UPDATE push_deliveries SET finished_at=? WHERE finished_at IS NULL AND expires_at<=?').bind(Date.now(),Date.now()).run();
  if(!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const now=Date.now();
  const rows=await env.DB.prepare(`SELECT d.*,s.endpoint,s.p256dh,s.auth,s.session_id,s.epoch FROM push_deliveries d
    JOIN push_subscriptions s ON s.id=d.device_id WHERE d.finished_at IS NULL AND d.next_at<=? ORDER BY d.next_at LIMIT 5`).bind(now).all<Delivery>();
  for(const d of rows.results) {
    const finish=()=>env.DB.prepare('UPDATE push_deliveries SET finished_at=? WHERE event_id=? AND device_id=?').bind(Date.now(),d.event_id,d.device_id).run();
    if(d.expires_at<=now || (d.kind!=='test' && visible.has(d.device_id))) {await finish();continue;}
    if(!await validIdentity(env,{deviceId:d.device_id,sessionId:d.session_id,epoch:d.epoch,expires:now+60_000})) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(d.device_id).run();continue;
    }
    await env.DB.prepare('UPDATE push_deliveries SET attempts=attempts+1,next_at=? WHERE event_id=? AND device_id=?')
      .bind(now+60_000*2**d.attempts,d.event_id,d.device_id).run();
    try {
      const subscription=validateSubscription({endpoint:d.endpoint,keys:{p256dh:d.p256dh,auth:d.auth}});
      const payload=await buildPushPayload({data:JSON.stringify(notificationMessage(d.kind,d.event_id)),options:{ttl:Math.min(3600,Math.max(0,Math.floor((d.expires_at-now)/1000)))}},subscription,
        {subject:env.VAPID_SUBJECT ?? 'https://discover.bricebrain.workers.dev',publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
      const response=await transport(d.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(10_000)});
      await response.body?.cancel();
      if(response.status===404 || response.status===410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(d.device_id).run();
      else if(response.ok || (response.status>=400 && response.status<500 && response.status!==429)) await finish();
      else if(d.attempts>=2) await finish();
    } catch {
      if(d.attempts>=2) await finish();
      console.warn(JSON.stringify({event:'push_delivery_retry',attempt:d.attempts+1}));
    }
  }
}
