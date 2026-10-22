import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { active, utcMonth } from '../src/cloud/store';
import { operation } from '../src/cloud/operations';
import { recoverCloud } from '../src/cloud/dispatch';
import { cloudRoute } from '../src/cloud/routes';
import { lease } from '../src/queue/leases';
import { retry, cancel, removeEntry, insertQueue } from '../src/routes/queue';
import { validateSource, validateScript, validateJudge } from '../src/cloud/editorial';
import { mp3Frames } from '../src/cloud/mp3';
import { cleanupCloud } from '../src/cloud/cleanup';
import realMp3 from './cloud-mp3.fixture.json';
import { NOTE, body, captured, options, cloudEnv, owner, cloudCall, cloudRequest, quoteNote, startNote, setupCloud, script, fakeMp3, create } from './cloud-fixtures';

beforeEach(setupCloud);
afterEach(()=>vi.unstubAllGlobals());
describe('autorisation et devis cloud',()=>{
  it('prépare et annule sans phrase lorsque la connexion de l’app est désactivée',async()=>{
    expect(await (await cloudCall('status',undefined,'')).json()).toMatchObject({owner:true,authRequired:false,enabled:true});
    const quote=await (await cloudCall('quotes',{target:{kind:'reflection',id:NOTE},options},'')).json<{id:string}>();
    const {id}=await (await cloudCall('runs',{quoteId:quote.id,acceptedMicros:1_000_000},'')).json<{id:string}>();
    const ctx=createExecutionContext();
    const res=await worker.fetch(new Request(`https://discover.test/api/queue/${id}`,{method:'DELETE',headers:{Origin:'https://discover.test','X-Discover-Client':'1'}}),cloudEnv,ctx);
    await waitOnExecutionContext(ctx);expect(res.status).toBe(204);
    const csrf=await worker.fetch(new Request('https://discover.test/api/cloud/runs',{method:'POST',headers:{Cookie:owner}}),cloudEnv,ctx);
    expect(csrf.status).toBe(403);
  });
  it('exige toujours une session si la connexion de l’app est réactivée',async()=>{
    const secured={...cloudEnv,AUTH_DISABLED:'false'};
    expect(await (await cloudRoute(cloudRequest('status',undefined,''),secured,'/api/cloud/status')).json()).toEqual({owner:false,authRequired:true,enabled:true});
    for (const path of ['quotes','runs']) {
      await expect(cloudRoute(cloudRequest(path,{},''),secured,`/api/cloud/${path}`)).rejects.toMatchObject({status:401});
    }
    const {id}=await startNote(), ctx=createExecutionContext();
    const res=await worker.fetch(new Request(`https://discover.test/api/queue/${id}`,{method:'DELETE',headers:{Origin:'https://discover.test','X-Discover-Client':'1'}}),secured,ctx);
    await waitOnExecutionContext(ctx);expect(res.status).toBe(401);
  });
  it('vérifie réellement la phrase et émet un cookie HttpOnly',async()=>{
    expect((await cloudCall('auth',{passphrase:'incorrect'},'')).status).toBe(401);
    const res=await cloudCall('auth',{passphrase:'test-passphrase-long-enough-1234'},'');
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly; SameSite=Strict');
  });
  it('refuse activation absente et options non prises en charge',async()=>{
    await expect(cloudRoute(cloudRequest('quotes',{}),{...cloudEnv,CLOUD_ATELIER_ENABLED:'false'},'/api/cloud/quotes')).rejects.toMatchObject({code:'cloud_disabled'});
    await expect(cloudCall('quotes',{target:{kind:'unsupported',id:'a'.repeat(20)},options})).rejects.toMatchObject({status:422});
    await expect(cloudCall('quotes',{target:{kind:'episode',id:'a'.repeat(20)},options})).rejects.toMatchObject({status:422,code:'cloud_source'});
    await expect(cloudCall('quotes',{target:{kind:'reflection',id:NOTE},options:{...options,faithful:true}})).rejects.toMatchObject({code:'cloud_options'});
  });
  it('fige la note au devis sans appel IA et refuse ensuite son texte trop court',async()=>{
    const http=vi.fn(()=>{throw new Error('Réseau interdit');});vi.stubGlobal('fetch',http);
    const q=await quoteNote();
    await env.DB.prepare("UPDATE reflections SET body_md='modifié' WHERE id=?").bind(NOTE).run();
    const {id}=await (await cloudCall('runs',{quoteId:q.id,acceptedMicros:1_000_000})).json<{id:string}>();
    expect((await env.DB.prepare('SELECT snapshot_json FROM cloud_runs WHERE id=?').bind(id).first<{snapshot_json:string}>())!.snapshot_json).toContain(body);
    await expect(quoteNote()).rejects.toMatchObject({code:'cloud_text_size'});expect(http).not.toHaveBeenCalled();
  });
  it('vérifie une vidéo publique terminée <=15 minutes avant tout achat',async()=>{
    const video={snippet:{title:'Video',channelTitle:'Author',liveBroadcastContent:'none'},contentDetails:{duration:'PT14M'},status:{privacyStatus:'public',uploadStatus:'processed'}};
    const http=vi.fn().mockResolvedValueOnce(Response.json({items:[video]}));vi.stubGlobal('fetch',http);
    expect(await (await cloudCall('quotes',{target:{kind:'youtube',id:'AbCdEf01234'},options})).json()).toMatchObject({title:'Video',durationSec:840,attribution:'Author'});
    expect(http.mock.calls[0]![0]).toContain('www.googleapis.com/youtube/v3/videos');
    for (const bad of [{...video,contentDetails:{duration:'PT16M'}},{...video,status:{privacyStatus:'unlisted',uploadStatus:'processed'}},{...video,snippet:{...video.snippet,liveBroadcastContent:'live'}}]) {
      http.mockResolvedValueOnce(Response.json({items:[bad]}));
      await expect(cloudCall('quotes',{target:{kind:'youtube',id:'AbCdEf01234'},options})).rejects.toMatchObject({code:'youtube_unavailable'});
    }
  });
});
describe('budget, exclusion et reprise',()=>{
  it('double clic et dispatch perdu ne créent qu’une réservation',async()=>{
    const q=await quoteNote(), b={quoteId:q.id,acceptedMicros:1_000_000};
    const replies=await Promise.all([cloudCall('runs',b),cloudCall('runs',b)]);
    const ids=await Promise.all(replies.map(r=>r.json<{id:string}>()));expect(ids[0]!.id).toBe(ids[1]!.id);
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM cloud_runs').first<{n:number}>())!.n).toBe(1);
    await recoverCloud(cloudEnv);expect(create).toHaveBeenCalledWith({id:ids[0]!.id,params:{id:ids[0]!.id}});
  });
  it('refuse devis périmé ou accord absent et plafonne deux réservations concurrentes',async()=>{
    const first=await quoteNote();
    await expect(cloudCall('runs',{quoteId:first.id,acceptedMicros:0})).rejects.toMatchObject({code:'cloud_consent'});
    await env.DB.prepare("UPDATE cloud_quotes SET expires_at='2000-01-01'").run();
    await expect(cloudCall('runs',{quoteId:first.id,acceptedMicros:1_000_000})).rejects.toMatchObject({code:'quote_expired'});
    const quotes=[];
    for(let i=0;i<2;i++) {
      const ref=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO reflections(id,title,body_md,kind,tags_json,created_at,updated_at) VALUES (?,'Note',?,'observation','[]','2026-01-01','2026-01-01')`).bind(ref,body).run();
      quotes.push(await quoteNote(ref));
    }
    const limited={...cloudEnv,CLOUD_MONTHLY_USD:'1'};
    const results=await Promise.allSettled(quotes.map(q=>cloudRoute(cloudRequest('runs',{quoteId:q.id,acceptedMicros:1_000_000}),limited,'/api/cloud/runs')));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await env.DB.prepare('SELECT SUM(reserved_micros) n FROM cloud_runs WHERE month=?').bind(utcMonth()).first<{n:number}>())!.n).toBe(1_000_000);
  });
  it('l’ancien Mac ne prend jamais le cloud, même expiré ou ciblé, et retry reste bloqué',async()=>{
    const {id}=await startNote();await env.DB.prepare("UPDATE prepare_queue SET lease_expires_at='2000-01-01'").run();
    for (const itemId of [undefined,id]) expect(await (await lease(new Request('https://internal/lease',{method:'POST',body:JSON.stringify({owner:'old-mac',itemId})}),cloudEnv)).json()).toEqual({item:null});
    await recoverCloud(cloudEnv);await expect(retry(cloudEnv,id)).rejects.toMatchObject({code:'cloud_no_retry'});
  });
  it('ne confond pas les intentions Mac et cloud',async()=>{
    await insertQueue(cloudEnv,'reflection',NOTE,options);const q=await quoteNote();
    await expect(cloudCall('runs',{quoteId:q.id,acceptedMicros:1_000_000})).rejects.toMatchObject({code:'cloud_conflict'});
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM cloud_runs').first<{n:number}>())!.n).toBe(0);
  });
  it('réutilise le checkpoint, ne renvoie pas un achat incertain et garde le budget après retrait',async()=>{
    const {id}=await startNote(), send=vi.fn(async()=>new Uint8Array([1,2]));
    const key=await operation(cloudEnv,id,'voice','tts',send);expect(await operation(cloudEnv,id,'voice','tts',send)).toBe(key);expect(send).toHaveBeenCalledTimes(1);
    const broken=vi.fn(async()=>{throw new Error('réponse perdue');});
    await expect(operation(cloudEnv,id,'lost','tts',broken)).rejects.toThrow();
    await expect(operation(cloudEnv,id,'lost','tts',broken)).rejects.toThrow('incertain');expect(broken).toHaveBeenCalledTimes(1);
    await cancel(cloudEnv,id);await removeEntry(cloudEnv,id);
    expect((await env.DB.prepare('SELECT COUNT(*) n FROM cloud_operations WHERE run_id=?').bind(id).first<{n:number}>())!.n).toBe(2);
    expect(await (await cloudCall('status')).json()).toMatchObject({reservedMicros:1_000_000});
  });
  it('annulation et changement de mois empêchent toute nouvelle opération',async()=>{
    const {id}=await startNote(), send=vi.fn(async()=>new Uint8Array([1]));
    await env.DB.prepare("UPDATE cloud_runs SET month='2000-01' WHERE id=?").bind(id).run();await expect(active(cloudEnv,id,'tts')).rejects.toThrow('mois');
    await env.DB.prepare('UPDATE cloud_runs SET month=? WHERE id=?').bind(utcMonth(),id).run();await cancel(cloudEnv,id);
    await expect(operation(cloudEnv,id,'voice','tts',send)).rejects.toMatchObject({code:'lease_lost'});expect(send).not.toHaveBeenCalled();
  });
});
describe('édition et MP3',()=>{
  it('refuse texte altéré, provenance inventée ou faux verdict',()=>{
    const source=validateSource({language:'fr',paragraphs:[body]},captured);expect(validateScript(script,source).lines).toHaveLength(6);
    expect(()=>validateSource({language:'fr',paragraphs:[body.slice(0,-100)]},captured)).toThrow('altéré');
    expect(()=>validateScript({lines:script.lines.map(l=>({...l,sourceSegments:['invented']}))},source)).toThrow('provenance');
    expect(()=>validateJudge({verdict:'approved',reasons:[]})).toThrow();
  });
  it('mesure les trames et refuse mauvais format et troncature',()=>{
    expect(mp3Frames(fakeMp3(100)).samples).toBe(57_600);
    expect(()=>mp3Frames(fakeMp3(1).slice(0,155))).toThrow('tronquée');
    expect(()=>mp3Frames(new Uint8Array([255,251,144,0]))).toThrow('incompatible');expect(()=>mp3Frames(new Uint8Array())).toThrow('vide');
  });
  it('retire le bloc Info à débit différent d’un vrai MP3 et conserve exactement ses échantillons',()=>{
    const bytes=Uint8Array.from(atob(realMp3.base64),c=>c.charCodeAt(0)), parsed=mp3Frames(bytes);
    expect(parsed.samples).toBe(realMp3.samples);
    expect(parsed.bytes.length).toBeLessThan(bytes.length);
    expect(mp3Frames(parsed.bytes).samples).toBe(parsed.samples);
  });
  it('autorise une source courte sans inventer de texte pour atteindre quatre minutes',()=>{
    const short={lines:script.lines.slice(0,2).map(l=>({...l,text:'The project was announced, but its results remain uncertain.'}))};
    expect(validateScript(short,{language:'fr',paragraphs:[body]}).lines).toHaveLength(2);
  });
});
it('purge les copies de travail après 30 jours mais conserve budget et anti-doublon',async()=>{
  const {id}=await startNote();
  await operation(cloudEnv,id,'source','transcribe',async()=>new Uint8Array([1]));
  await env.DB.prepare("UPDATE cloud_runs SET state='failed',updated_at='2000-01-01' WHERE id=?").bind(id).run();
  await env.DB.prepare("UPDATE cloud_quotes SET expires_at='2000-01-01'").run();
  await cleanupCloud(cloudEnv);
  expect(await env.FILES.head(`cloud/${id}/source`)).toBeNull();
  expect(await env.DB.prepare('SELECT snapshot_json,reserved_micros,purged_at FROM cloud_runs WHERE id=?').bind(id).first()).toMatchObject({snapshot_json:'{}',reserved_micros:1_000_000,purged_at:expect.any(String)});
  expect((await env.DB.prepare('SELECT COUNT(*) n FROM cloud_operations WHERE run_id=?').bind(id).first<{n:number}>())!.n).toBe(1);
});
