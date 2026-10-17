import { env } from 'cloudflare:workers';
import { beforeEach,expect,it } from 'vitest';
import { call,login,ATELIER_TOKEN,ORIGIN } from './helpers';
import { identity } from '../src/events/identity';
import { validateSubscription } from '../src/events/subscriptions';

let cookie='';const ep='a'.repeat(20);
const claim=async()=>{
  const r=await call('/atelier/queue/lease',{method:'POST',headers:{Authorization:`Bearer ${ATELIER_TOKEN}`},body:{owner:'events-test'}});
  return (await r.json<{item:{id:string;leaseToken:string}}>()).item;
};
beforeEach(async()=>{
  cookie=await login();
  await env.DB.batch([env.DB.prepare('DELETE FROM push_deliveries'),env.DB.prepare('DELETE FROM push_subscriptions'),env.DB.prepare('DELETE FROM queue_events'),env.DB.prepare('DELETE FROM prepare_queue')]);
  await env.DB.prepare("INSERT OR IGNORE INTO shows(id,title,feed_url,language,category,next_check_at,created_at) VALUES('events-test','Test','https://example.com/feed','en','tech','2026-01-01','2026-01-01')").run();
  await env.DB.prepare("INSERT OR IGNORE INTO episodes(id,show_id,guid,title,audio_url,created_at) VALUES(?,'events-test','events-test','Titre privé','https://example.com/a.mp3','2026-01-01')").bind(ep).run();
});
it('la migration enregistre les transitions atomiquement sans événement pour les seuls renouvellements de bail',async()=>{
  await call(`/api/episodes/${ep}/prepare`,{cookie,method:'POST',body:{}});
  const item=await claim();
  const heartbeat=()=>call(`/atelier/queue/${item.id}/heartbeat`,{method:'POST',headers:{Authorization:`Bearer ${ATELIER_TOKEN}`},body:{leaseToken:item.leaseToken,stage:'tts'}});
  await heartbeat();await heartbeat();
  const rows=await env.DB.prepare('SELECT status,stage FROM queue_events ORDER BY id').all();
  expect(rows.results).toEqual([{status:'pending',stage:null},{status:'leased',stage:'download'},{status:'leased',stage:'tts'}]);
  await env.DB.prepare("UPDATE prepare_queue SET status='done',content_id='test' WHERE id=?").bind(item.id).run();
  expect((await env.DB.prepare('SELECT notification FROM queue_events ORDER BY id DESC LIMIT 1').first())?.notification).toBe('ready');
});
it('une relecture n’est annoncée qu’après restitution du bail, et l’expiration épuisée produit un échec',async()=>{
  await call(`/api/episodes/${ep}/prepare`,{cookie,method:'POST',body:{}});const item=await claim();
  await call(`/atelier/queue/${item.id}/heartbeat`,{method:'POST',headers:{Authorization:`Bearer ${ATELIER_TOKEN}`},body:{leaseToken:item.leaseToken,stage:'review'}});
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM queue_events WHERE notification IS NOT NULL').first())?.n).toBe(0);
  await call(`/atelier/queue/${item.id}/release`,{method:'POST',headers:{Authorization:`Bearer ${ATELIER_TOKEN}`},body:{leaseToken:item.leaseToken,stage:'review'}});
  expect((await env.DB.prepare('SELECT notification FROM queue_events ORDER BY id DESC LIMIT 1').first())?.notification).toBe('review');
  await env.DB.prepare("UPDATE prepare_queue SET attempts=3,status='leased',lease_expires_at='2026-01-01' WHERE id=?").bind(item.id).run();
  await call('/api/queue',{cookie});
  expect((await env.DB.prepare('SELECT notification FROM queue_events ORDER BY id DESC LIMIT 1').first())?.notification).toBe('failed');
});
it('le websocket exige une session, une origine correcte et un appareil reconnu',async()=>{
  expect((await call('/api/events',{headers:{Upgrade:'websocket'}})).status).toBe(401);
  expect((await call('/api/events',{cookie,headers:{Origin:'https://evil.test',Upgrade:'websocket'}})).status).toBe(403);
  expect((await call('/api/events',{cookie})).status).toBe(426);
  expect((await call('/api/events',{cookie,headers:{Upgrade:'websocket'}})).status).toBe(401);
});
it('le websocket diffuse des invalidations sans titre ni jeton, et ferme une session révoquée',async()=>{
  const cfg=await call('/api/notifications/config',{cookie});const device=cfg.headers.get('Set-Cookie')!.split(';')[0];
  const combined=cookie+'; '+device;
  const r=await call('/api/events',{cookie:combined,headers:{Upgrade:'websocket'}});
  expect(r.status).toBe(101);const ws=r.webSocket!;ws.accept();
  const messages:string[]=[];ws.addEventListener('message',e=>{messages.push(String(e.data));});
  await call(`/api/episodes/${ep}/prepare`,{cookie,method:'POST',body:{}});
  await env.EVENTS.getByName('personal-library').flush();
  await new Promise(resolve=>setTimeout(resolve,20));
  expect(messages.some(m=>JSON.parse(m).type==='queue.changed')).toBe(true);
  expect(messages.join('')).not.toContain('Titre privé');expect(messages.join('')).not.toContain('leaseToken');
  const closed=new Promise<number>(resolve=>ws.addEventListener('close',e=>{resolve(e.code);}));
  await call('/api/auth/logout',{cookie,method:'POST',body:{}});
  await env.EVENTS.getByName('personal-library').flush();
  expect(await closed).toBe(1008);
});
it('le coordinateur reprend une outbox persistée, sans répéter les transitions traitées',async()=>{
  await env.DB.prepare("INSERT INTO queue_events(queue_id,status,stage) VALUES('persisted','pending','review')").run();
  await env.EVENTS.getByName('personal-library').flush();
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM queue_events WHERE dispatched_at IS NULL').first())?.n).toBe(0);
  await env.EVENTS.getByName('personal-library').flush();
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM queue_events').first())?.n).toBe(1);
});
it('les abonnements refusent les destinations arbitraires et les requêtes sans protections CSRF',async()=>{
  for(const endpoint of ['https://example.com/push','https://127.0.0.1/push','http://fcm.googleapis.com/push','https://fcm.googleapis.com.evil.test/push']) {
    expect(()=>validateSubscription({endpoint,keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}})).toThrow();
  }
  expect((await call('/api/notifications/subscription',{cookie,method:'PUT',body:{},pwa:false})).status).toBe(403);
  const cfg=await call('/api/notifications/config',{cookie});expect(cfg.headers.get('Set-Cookie')).toContain('HttpOnly; SameSite=Strict');
  const a=await identity(env,new Request(ORIGIN,{headers:{Cookie:cookie}}),true);expect(a?.attachment.sessionId).toBeTruthy();
});

it('une notification de relecture en attente est annulée si la préparation a déjà repris',async()=>{
  await env.DB.prepare("INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,epoch,created_at,updated_at) VALUES('stale','https://fcm.googleapis.com/stale','key','auth','epoch','2026-01-01','2026-01-01')").run();
  const review=await env.DB.prepare("INSERT INTO queue_events(queue_id,status,stage,notification) VALUES('review-history','pending','review','review') RETURNING id").first<{id:number}>();
  await env.DB.prepare("INSERT INTO push_deliveries(event_id,device_id,kind,next_at,expires_at) VALUES(?,'stale','review',?,?)").bind(String(review!.id),Date.now()+60_000,Date.now()+120_000).run();
  await env.DB.prepare("INSERT INTO queue_events(queue_id,status,stage) VALUES('review-history','leased','tts')").run();
  await env.EVENTS.getByName('personal-library').flush();
  expect((await env.DB.prepare("SELECT finished_at FROM push_deliveries WHERE device_id='stale'").first())?.finished_at).not.toBeNull();
});
