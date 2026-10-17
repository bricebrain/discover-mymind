import { env } from 'cloudflare:workers';
import { beforeEach,expect,it,vi } from 'vitest';
import type { Env } from '../src/env';
import { eventEpoch } from '../src/events/identity';
import { notifications } from '../src/events/subscriptions';
import { deliverPush,notificationMessage } from '../src/events/push';

const encode=(a:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
let cfg:Env,subscriber:{endpoint:string;keys:{p256dh:string;auth:string}};
const cookie='__Host-discover_device='+'x'.repeat(43);
const req=(path:string,method='GET',body?:unknown)=>new Request('https://discover.test'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
async function enroll() {
 await notifications(req('/api/notifications/subscription','PUT',subscriber),cfg,'/api/notifications/subscription');
 return (await env.DB.prepare('SELECT id FROM push_subscriptions').first<{id:string}>())!.id;
}
async function queue(id:string,kind='ready') {
 await env.DB.prepare('INSERT INTO push_deliveries(event_id,device_id,kind,next_at,expires_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,kind,Date.now(),Date.now()+60_000).run();
}
beforeEach(async()=>{
 await env.DB.batch([env.DB.prepare('DELETE FROM push_deliveries'),env.DB.prepare('DELETE FROM push_subscriptions')]);
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']) as CryptoKeyPair;
 const jwk=await crypto.subtle.exportKey('jwk',keys.privateKey) as JsonWebKey;
 cfg={...env,AUTH_DISABLED:'true',VAPID_PUBLIC_KEY:encode(await crypto.subtle.exportKey('raw',keys.publicKey) as ArrayBuffer),VAPID_PRIVATE_KEY:jwk.d};
 const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
 subscriber={endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:encode(await crypto.subtle.exportKey('raw',client.publicKey) as ArrayBuffer),auth:encode(crypto.getRandomValues(new Uint8Array(16)).buffer)}};
});
it('un appareil ne peut ni lire ni désabonner les autres ; aucun endpoint n’est exposé',async()=>{
 const id=await enroll();
 const config=await notifications(req('/api/notifications/config'),cfg,'/api/notifications/config');
 expect(await config.json()).toEqual({publicKey:cfg.VAPID_PUBLIC_KEY,configured:true,enabled:true});
 const stranger=new Request('https://discover.test/api/notifications/subscription',{method:'DELETE',headers:{Cookie:'__Host-discover_device='+'y'.repeat(43)}});
 await notifications(stranger,cfg,'/api/notifications/subscription');
 expect((await env.DB.prepare('SELECT id FROM push_subscriptions').first())?.id).toBe(id);
 await notifications(req('/api/notifications/subscription','DELETE'),cfg,'/api/notifications/subscription');
 expect(await env.DB.prepare('SELECT id FROM push_subscriptions').first()).toBeNull();
});
it('envoie un message chiffré VAPID puis ne le renvoie pas',async()=>{
 const id=await enroll();await queue(id);
 const transport=vi.fn<typeof fetch>(async(_url,init)=>{
   const native=new Request(_url,init);
   const headers=native.headers;expect(headers.get('Content-Encoding')).toBe('aes128gcm');
   expect(headers.get('Authorization')).toMatch(/^vapid /);expect(native.redirect).toBe('manual');
   expect(native.headers.get('Content-Length')).toBe('4096');return new Response(null,{status:201});
 });
 await deliverPush(cfg,new Set(),transport);await deliverPush(cfg,new Set(),transport);
 expect(transport).toHaveBeenCalledTimes(1);
 expect((await env.DB.prepare('SELECT finished_at FROM push_deliveries').first())?.finished_at).not.toBeNull();
});
it('ne notifie pas un appareil actuellement visible, mais permet son test explicite',async()=>{
 const id=await enroll();await queue(id);await queue(id,'test');const transport=vi.fn<typeof fetch>(async()=>new Response(null,{status:201}));
 await deliverPush(cfg,new Set([id]),transport);expect(transport).toHaveBeenCalledTimes(1);
 expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM push_deliveries WHERE finished_at IS NOT NULL').first())?.n).toBe(2);
});
it('supprime un abonnement expiré (410) avec ses livraisons',async()=>{
 const id=await enroll();await queue(id);await deliverPush(cfg,new Set(),async()=>new Response(null,{status:410}));
 expect(await env.DB.prepare('SELECT id FROM push_subscriptions').first()).toBeNull();
 expect(await env.DB.prepare('SELECT event_id FROM push_deliveries').first()).toBeNull();
});
it('reprend un échec temporaire, borne les tentatives et ne conserve aucune erreur privée',async()=>{
 const id=await enroll();await queue(id);const transport=vi.fn<typeof fetch>(async()=>new Response(null,{status:503}));
 for(let i=0;i<4;i++) {await env.DB.prepare('UPDATE push_deliveries SET next_at=0').run();await deliverPush(cfg,new Set(),transport);}
 expect(transport).toHaveBeenCalledTimes(3);
 expect((await env.DB.prepare('SELECT attempts,finished_at FROM push_deliveries').first())?.attempts).toBe(3);
});
it('n’envoie rien pour une session révoquée ou une ancienne époque',async()=>{
 const id=await enroll();await queue(id);await env.DB.prepare("UPDATE push_subscriptions SET epoch='old'").run();
 const transport=vi.fn<typeof fetch>();await deliverPush(cfg,new Set(),transport);expect(transport).not.toHaveBeenCalled();
 expect(await env.DB.prepare('SELECT id FROM push_subscriptions').first()).toBeNull();
 expect(await eventEpoch(cfg)).not.toBe('old');
});
it('le test explicite est limité et le contenu de notification reste générique',async()=>{
 await enroll();
 await notifications(req('/api/notifications/test','POST',{}),cfg,'/api/notifications/test');
 await expect(notifications(req('/api/notifications/test','POST',{}),cfg,'/api/notifications/test')).rejects.toMatchObject({code:'test_unavailable'});
 expect(notificationMessage('review','7')).toEqual({title:'Discover',body:'Une version attend ta relecture dans l’Atelier sur le Mac.',tag:'discover-7',url:'/library'});
});
it('refuse une clé de chiffrement invalide avant de stocker l’abonnement',async()=>{
 await expect(notifications(req('/api/notifications/subscription','PUT',{...subscriber,keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}),cfg,'/api/notifications/subscription')).rejects.toMatchObject({code:'invalid_subscription'});
 expect(await env.DB.prepare('SELECT id FROM push_subscriptions').first()).toBeNull();
});

it('ne suit jamais une redirection du service Push ni ne renvoie le jeton ailleurs',async()=>{
 const id=await enroll();await queue(id);
 const transport=vi.fn<typeof fetch>(async(input,init)=>{
   const request=new Request(input,init);expect(request.redirect).toBe('manual');
   return new Response(null,{status:302,headers:{Location:'https://evil.test'}});
 });
 await deliverPush(cfg,new Set(),transport);await deliverPush(cfg,new Set(),transport);
 expect(transport).toHaveBeenCalledTimes(1);
 expect((await env.DB.prepare('SELECT finished_at FROM push_deliveries').first())?.finished_at).not.toBeNull();
});
