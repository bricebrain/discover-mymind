import { env } from 'cloudflare:workers';
import { beforeEach,expect,it } from 'vitest';
import { canonicalJson } from '../src/publications/validation';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN,call,login } from './helpers';
import type { Manifest } from '../src/publications/types';

const headers={Authorization:`Bearer ${ATELIER_TOKEN}`};
const ep='b'.repeat(20);
let cookie:string;
beforeEach(async () => {
  cookie=await login();
  await env.DB.prepare('DELETE FROM prepare_queue').run();
  await env.DB.prepare("INSERT OR IGNORE INTO episodes (id,show_id,guid,title,audio_url,created_at) SELECT ?,id,'q-pub','Episode','https://example.com/audio.mp3','2026-10-17' FROM shows LIMIT 1").bind(ep).run();
});

it('refuse l’ancienne instance au commit et à l’envoi, y compris après rattachement au nouveau bail',async () => {
  await call(`/api/episodes/${ep}/prepare`,{method:'POST',body:{},cookie});
  const claim=async () => (await (await call('/atelier/queue/lease',{method:'POST',headers,body:{owner:'mac'}})).json<{item:{id:string;leaseToken:string}}>()).item;
  const first=await claim();
  const raw=canonicalJson({schemaVersion:1,variantKey:'en-source',segments:[{id:'s001',text:'A source sentence.',startMs:null,endMs:null}]});
  const path='segments/en-source.json';
  const m:Manifest={schemaVersion:1,content:{id:'queue-pub-test',title:'Test',originalLanguage:'en',sourceType:'podcast',sourceRef:`episode:${ep}`,rights:'personal_use'},
    variants:[{key:'en-source',kind:'source',language:'en',segmentsFile:path,audio:{source:'publisher_stream',url:'https://example.com/audio.mp3',origin:'original',durationMs:2000,timingSource:'none'}}],
    files:{[path]:{sha256:await sha256Hex(raw),size:raw.length,contentType:'application/json'}},removeVariants:[]};
  const declare=(token:string,manifest=m) => call('/atelier/publications',{method:'POST',headers,body:{manifest,queueItemId:first.id,leaseToken:token}});
  const mismatch=structuredClone(m);mismatch.content.sourceRef=`episode:${'c'.repeat(20)}`;
  expect((await declare(first.leaseToken,mismatch)).status).toBe(422);
  const declared=await declare(first.leaseToken);
  expect(declared.status,await declared.clone().text()).toBe(200);
  const {publicationId}=await declared.json<{publicationId:string}>();
  await env.DB.prepare("UPDATE prepare_queue SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(first.id).run();
  const commit=(token:string) => call(`/atelier/publications/${publicationId}/commit`,{method:'POST',headers:{...headers,'X-Discover-Lease-Token':token}});
  expect((await commit(first.leaseToken)).status).toBe(409);
  const second=await claim();
  expect(second.leaseToken).not.toBe(first.leaseToken);
  const resumed=await declare(second.leaseToken);
  expect(resumed.status,await resumed.clone().text()).toBe(200);
  expect((await resumed.json<{publicationId:string}>()).publicationId).toBe(publicationId);
  const upload=(token:string) => call(`/atelier/publications/${publicationId}/files/${path}`,{method:'PUT',body:raw,headers:{...headers,'X-Discover-Lease-Token':token,
    'Content-Type':'application/json','Content-Length':String(raw.length),'x-content-sha256':m.files[path]!.sha256}});
  expect((await upload(first.leaseToken)).status).toBe(409);
  expect((await commit(first.leaseToken)).status).toBe(409);
  expect((await upload(second.leaseToken)).status).toBe(200);
  expect((await commit(second.leaseToken)).status).toBe(200);
  expect(await env.DB.prepare('SELECT status,content_id FROM prepare_queue WHERE id=?').bind(first.id).first()).toMatchObject({status:'done',content_id:m.content.id});
});
