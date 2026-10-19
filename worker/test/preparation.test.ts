import { env } from 'cloudflare:workers';
import { beforeEach,expect,it } from 'vitest';
import { automaticPreparation } from '../src/queue/automatic';
import { assertPrepared } from '../src/publications/preparation';
import type { Manifest,Publication } from '../src/publications/types';
import { ATELIER_TOKEN,call,login } from './helpers';

const now=Date.parse('2026-10-17T12:00:00Z');
const ep='c'.repeat(20),older='d'.repeat(20);
beforeEach(async()=>{
 await env.DB.prepare('DELETE FROM prepare_queue').run();
 await env.DB.prepare("INSERT OR IGNORE INTO shows (id,title,feed_url,language,category,auto_prepare,next_check_at,created_at) VALUES ('auto-test','Édito','https://example.com/feed','fr','economy',1,'2026-01-01','2026-01-01')").run();
 await env.DB.prepare("INSERT OR REPLACE INTO episodes (id,show_id,guid,title,audio_url,duration_sec,published_at,created_at) VALUES (?,'auto-test','latest','Édito','https://example.com/a.mp3',120,'2026-10-17','2026-10-17'),(?,'auto-test','older','Ancien','https://example.com/b.mp3',100,'2026-10-16','2026-10-16')").bind(ep,older).run();
});
it('automatise seulement le dernier épisode et ne recrée jamais une demande annulée ou en échec',async()=>{
 await automaticPreparation(env,'auto-test',now).run();
 await automaticPreparation(env,'auto-test',now).run();
 const rows=await env.DB.prepare('SELECT ref,options_json FROM prepare_queue').all<{ref:string;options_json:string}>();
 expect(rows.results).toHaveLength(1);expect(rows.results[0]!.ref).toBe(ep);
 expect(JSON.parse(rows.results[0]!.options_json)).toEqual({coverage:'essentials',level:'B1',style:'narration',targetMinutes:4,faithful:false,keepOriginalCopy:false});
 await env.DB.prepare("UPDATE prepare_queue SET status='cancelled'").run();
 await automaticPreparation(env,'auto-test',now).run();
 expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM prepare_queue').first<{n:number}>())?.n).toBe(1);
});
it('suit la formule et le niveau de l’émission, l’interrupteur général et le désabonnement',async()=>{
 await env.DB.prepare("UPDATE shows SET auto_preset='condensed8',auto_level='B2' WHERE id='auto-test'").run();
 await automaticPreparation(env,'auto-test',now).run();
 const row=await env.DB.prepare('SELECT options_json FROM prepare_queue').first<{options_json:string}>();
 expect(JSON.parse(row!.options_json)).toEqual({coverage:'condensed',level:'B2',style:'narration',targetMinutes:8,faithful:false,keepOriginalCopy:false});
 await env.DB.prepare('DELETE FROM prepare_queue').run();
 await env.DB.prepare("UPDATE app_settings SET value='0' WHERE key='auto_prepare_enabled'").run();
 await automaticPreparation(env,'auto-test',now).run();
 expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM prepare_queue').first<{n:number}>())?.n).toBe(0);
 await env.DB.prepare("UPDATE app_settings SET value='1' WHERE key='auto_prepare_enabled'").run();
 await env.DB.prepare("UPDATE shows SET enabled=0,auto_preset='essentials4',auto_level='B1' WHERE id='auto-test'").run();
 await automaticPreparation(env,'auto-test',now).run();
 expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM prepare_queue').first<{n:number}>())?.n).toBe(0);
 await env.DB.prepare("UPDATE shows SET enabled=1 WHERE id='auto-test'").run();
});
it('règle la préparation automatique depuis la PWA et l’Atelier, jamais pour une chaîne YouTube',async()=>{
 const cookie=await login();const headers={Authorization:`Bearer ${ATELIER_TOKEN}`};
 const patch=await call('/api/shows/auto-test',{method:'PATCH',cookie,body:{autoPrepare:true,autoPreset:'condensed8',autoLevel:'A2'}});
 expect(patch.status,await patch.clone().text()).toBe(200);
 expect((await patch.json<{show:Record<string,unknown>}>()).show).toMatchObject({autoPrepare:true,autoPreset:'condensed8',autoLevel:'A2'});
 expect((await call('/api/shows/auto-test',{method:'PATCH',cookie,body:{autoPreset:'full'}})).status).toBe(400);
 const fromAtelier=await call('/atelier/shows/auto-test',{method:'PATCH',headers,body:{autoPreset:'essentials4'}});
 expect(fromAtelier.status).toBe(200);
 await env.DB.prepare("INSERT OR IGNORE INTO shows (id,title,feed_url,language,category,next_check_at,created_at,source_type,channel_id) VALUES ('yt-test','Chaîne','https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890123456789012','en','tech','2026-01-01','2026-01-01','youtube','UC1234567890123456789012')").run();
 expect((await call('/api/shows/yt-test',{method:'PATCH',cookie,body:{autoPrepare:true}})).status).toBe(422);
 expect((await (await call('/api/settings/auto-prepare',{method:'PUT',cookie,body:{enabled:false}})).json<{enabled:boolean}>()).enabled).toBe(false);
 expect((await (await call('/api/shows',{cookie})).json<{autoPrepareEnabled:boolean}>()).autoPrepareEnabled).toBe(false);
 expect((await (await call('/atelier/settings/auto-prepare',{method:'PUT',headers,body:{enabled:true}})).json<{enabled:boolean}>()).enabled).toBe(true);
});
it('une relecture ne repart que pour la demande explicitement choisie',async()=>{
 const cookie=await login();const headers={Authorization:`Bearer ${ATELIER_TOKEN}`};
 await call(`/api/episodes/${ep}/prepare`,{method:'POST',body:{},cookie});
 const claim=async(body:object)=>(await (await call('/atelier/queue/lease',{method:'POST',headers,body:{owner:'mac',...body}})).json<{item:{id:string;leaseToken:string}|null}>()).item;
 const first=(await claim({}))!;
 expect((await call(`/atelier/queue/${first.id}/release`,{method:'POST',headers,body:{leaseToken:first.leaseToken,stage:'review'}})).status).toBe(200);
 expect(await claim({})).toBeNull();
 expect((await claim({itemId:first.id,includeReview:true}))!.id).toBe(first.id);
});
it('bloque la publication automatique review/rejected et exige les options réellement demandées',async()=>{
 const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at) VALUES (?,'episode',?,?,'2026-10-17','2026-10-17')")
  .bind(id,ep,JSON.stringify({coverage:'full',level:'B1',style:'narration',faithful:false,keepOriginalCopy:false})).run();
 const p:Publication={id:'pub',content_id:'test',revision:'rev',seq:1,status:'uploading',manifest_r2_key:'manifest',queue_item_id:id,lease_token:'token',commit_token:null};
 const m:Manifest={schemaVersion:1,content:{id:'test',title:'Test',sourceType:'podcast',originalLanguage:'en',rights:'personal_use'},files:{},variants:[{key:'en-full-b1',kind:'adaptation',language:'en',coverage:'full',cefrLevel:'B1',style:'narration',segmentsFile:'segments/en-full-b1.json',evaluation:{verdict:'review'},audio:{source:'r2',origin:'kokoro',durationMs:1000,file:'audio/en-full-b1.mp3',timingSource:'kokoro'}}]};
 await expect(assertPrepared(env,p,m)).rejects.toMatchObject({code:'review_required'});
 m.variants[0]!.evaluation={verdict:'review',acceptedByUser:true,reviewedAt:'2026-10-17T12:00:00Z'};
 await expect(assertPrepared(env,p,m)).resolves.toBeUndefined();
 m.variants[0]!.evaluation={verdict:'rejected',acceptedByUser:true,reviewedAt:'2026-10-17T12:00:00Z'};
 await expect(assertPrepared(env,p,m)).rejects.toMatchObject({code:'review_required'});
 m.variants[0]!.evaluation={verdict:'review',autoPublished:true};
 await expect(assertPrepared(env,p,m)).resolves.toBeUndefined();
 m.variants[0]!.evaluation={verdict:'rejected',autoPublished:true};
 await expect(assertPrepared(env,p,m)).resolves.toBeUndefined();
 m.variants[0]!.evaluation={verdict:'rejected',autoPublished:'oui'};
 await expect(assertPrepared(env,p,m)).rejects.toMatchObject({code:'review_required'});
 m.variants=[];await expect(assertPrepared(env,p,m)).rejects.toMatchObject({code:'prepared_variant_missing'});
});

it('accepte Deepgram synchronisé et refuse une origine/timing incohérents pour terminer une demande', async () => {
 const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at) VALUES (?,'episode',?,?,'2026-10-19','2026-10-19')")
  .bind(id,ep,JSON.stringify({coverage:'full',level:'B1',style:'narration',faithful:false,keepOriginalCopy:false})).run();
 const p:Publication={id:'pub',content_id:'test',revision:'rev',seq:1,status:'uploading',manifest_r2_key:'manifest',queue_item_id:id,lease_token:'token',commit_token:null};
 const m:Manifest={schemaVersion:1,content:{id:'test',title:'Test',sourceType:'podcast',originalLanguage:'en',rights:'personal_use'},files:{},variants:[{key:'en-full-b1',kind:'adaptation',language:'en',coverage:'full',cefrLevel:'B1',style:'narration',segmentsFile:'segments/en-full-b1.json',evaluation:{verdict:'ok'},audio:{source:'r2',origin:'deepgram',durationMs:1000,file:'audio/en-full-b1.mp3',timingSource:'deepgram'}}]};
 await expect(assertPrepared(env,p,m)).resolves.toBeUndefined();
 m.variants[0]!.audio!.timingSource='kokoro';
 await expect(assertPrepared(env,p,m)).rejects.toMatchObject({code:'prepared_variant_missing'});
});
