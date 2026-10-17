import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ATELIER_TOKEN, call, login } from './helpers';
import { expireExhausted } from '../src/queue/store';

const EP = 'a'.repeat(20);
const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const atelier = (path: string,body: unknown) => call('/atelier/queue'+path,{ method: 'POST',body,headers });
let cookie: string;
beforeEach(async () => {
  await env.DB.batch(['DELETE FROM prepare_queue','DELETE FROM episodes','DELETE FROM shows','DELETE FROM sessions','DELETE FROM login_attempts']
    .map((s) => env.DB.prepare(s)));
  await env.DB.prepare("INSERT INTO shows (id,title,feed_url,language,category,next_check_at,created_at) VALUES ('show','Show','https://example.com/rss','fr','news','2026-01-01','2026-01-01')").run();
  await env.DB.prepare("INSERT INTO episodes (id,show_id,guid,title,audio_url,duration_sec,created_at) VALUES (?,'show','ep','Épisode','https://example.com/audio.mp3',3000,'2026-01-01')").bind(EP).run();
  cookie = await login();
});
const enqueue = (body: unknown = {}) => call(`/api/episodes/${EP}/prepare`,{method:'POST',body,cookie});
const claim = async (owner = 'mac') => (await atelier('/lease',{owner})).json<{ item: { id: string; leaseToken: string; attempts: number; options: object; source: object } | null }>();
const expire = () => env.DB.prepare("UPDATE prepare_queue SET lease_expires_at='2000-01-01T00:00:00.000Z'").run();

describe('file à préparer', () => {
  it('refuse les accès sans session, sans CSRF et sans jeton Atelier', async () => {
    expect((await call('/api/queue')).status).toBe(401);
    expect((await call(`/api/episodes/${EP}/prepare`,{method:'POST',body:{},cookie,pwa:false})).status).toBe(403);
    expect((await call('/atelier/queue/lease',{method:'POST',body:{owner:'mac'},cookie})).status).toBe(401);
  });
  it('valide les options et ne crée qu’une demande active, même en concurrence', async () => {
    for (const body of [null,[],{coverage:'bad'},{coverage:['full']},{level:['B1']},{style:['narration']},{coverage:null},{targetMinutes:'12'},{coverage:'condensed',targetMinutes:7},{coverage:'essentials',targetMinutes:7},{level:'C2'},{style:'bad'},{faithful:'yes'},{keepOriginalCopy:1},{unknown:1}]) {
      expect((await enqueue(body)).status,JSON.stringify(body)).toBe(422);
    }
    const results = await Promise.all([enqueue(),enqueue()]);
    expect(results.map((r) => r.status).sort()).toEqual([200,201]);
    expect(await results[0]!.json()).toMatchObject({item:{options:{coverage:'condensed',level:'B1',targetMinutes:12}}});
    expect((await enqueue({coverage:'full'})).status).toBe(409);
    await env.DB.prepare("UPDATE shows SET language='en'").run();
    expect((await enqueue({faithful:true})).status).toBe(422);
  });
  it('deux instances ne prennent jamais la même demande ; les jetons restent privés', async () => {
    await enqueue();
    const results = await Promise.all([claim('mac-a'),claim('mac-b')]);
    expect(results.filter((r) => r.item)).toHaveLength(1);
    expect(results.find((r) => r.item)?.item).toMatchObject({source:{audioUrl:'https://example.com/audio.mp3',language:'fr'},attempts:1});
    const data = await (await call('/api/queue',{cookie})).text();
    expect(data).not.toContain('leaseToken');
    expect(data).not.toContain(results.find((r) => r.item)!.item!.leaseToken);
  });
  it('reprend après expiration et rejette toutes les écritures de l’ancienne instance', async () => {
    await enqueue();
    const first = (await claim()).item!;
    await expire();
    const second = (await claim('other')).item!;
    expect(second.id).toBe(first.id);
    expect(second.attempts).toBe(2);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    for (const action of ['heartbeat','release','fail']) {
      const res = await atelier(`/${first.id}/${action}`,{leaseToken:first.leaseToken,stage:'download',error:'Interrompu',retryable:true});
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({error:{code:'lease_lost'}});
    }
    expect((await atelier(`/${second.id}/heartbeat`,{leaseToken:second.leaseToken,stage:'transcribe'})).status).toBe(200);
  });
  it('échoue après trois interruptions et permet de réessayer explicitement', async () => {
    await enqueue();
    let id = '';
    for (let n=0;n<3;n++) { id=(await claim()).item!.id; await expire(); }
    await expireExhausted(env);
    expect((await claim()).item).toBeNull();
    const data = await (await call('/api/queue',{cookie})).json<{items:{status:string;error:string}[]}>();
    expect(data.items[0]).toMatchObject({status:'failed'});
    expect(data.items[0]!.error).toContain('trois tentatives');
    expect((await call(`/api/queue/${id}/retry`,{method:'POST',cookie,body:{}})).status).toBe(204);
    expect((await claim()).item!.attempts).toBe(1);
  });
  it('rend sans pénalité, conserve la dernière erreur et annule un travail en cours', async () => {
    await enqueue();
    let item = (await claim()).item!;
    expect((await atelier(`/${item.id}/release`,{leaseToken:item.leaseToken})).status).toBe(200);
    item = (await claim()).item!;
    expect(item.attempts).toBe(1);
    expect((await atelier(`/${item.id}/fail`,{leaseToken:item.leaseToken,error:'Téléchargement indisponible',retryable:true})).status).toBe(200);
    item=(await claim()).item!;
    expect(item.attempts).toBe(2);
    expect((await call(`/api/queue/${item.id}`,{method:'DELETE',cookie})).status).toBe(204);
    expect((await atelier(`/${item.id}/heartbeat`,{leaseToken:item.leaseToken,stage:'download'})).status).toBe(409);
  });
});

it('le point de reprise source ne termine pas la demande', async () => {
  await enqueue();
  const first=(await claim()).item!;
  expect((await atelier(`/${first.id}/release`,{leaseToken:first.leaseToken,sourceReady:true})).status).toBe(200);
  const sourceOnly = await (await atelier('/lease',{owner:'mac',sourceOnly:true})).json<{item:unknown}>();
  expect(sourceOnly.item).toBeNull();
  const data=await (await call('/api/queue',{cookie})).json<{items:{status:string;stage:string}[]}>();
  expect(data.items[0]).toMatchObject({status:'pending',stage:'source_ready'});
  expect((await claim()).item!.id).toBe(first.id);
});
