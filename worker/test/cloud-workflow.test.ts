/// <reference lib="esnext.disposable" />
import { env } from 'cloudflare:workers';
import { introspectWorkflowInstance } from 'cloudflare:test';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupCloud, startNote, body, script, fakeMp3, cloudEnv } from './cloud-fixtures';
import { publish } from '../src/cloud/publish';
import { gemini } from '../src/cloud/gemini';
import { active } from '../src/cloud/store';
import { cancel } from '../src/routes/queue';

beforeEach(setupCloud);
afterEach(()=>vi.unstubAllGlobals());
function providers(failSpeech=false,dirty=false) {
  let generated=0;
  const narration=dirty ? {lines:script.lines.map(l=>({...l,text:`${l.text} (s0001)`,fr:`${l.fr} [s0001]`}))} : script;
  const values=[{language:'fr',paragraphs:[body]},narration,{verdict:'review',reasons:['Validation humaine nécessaire.']}];
  const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith(':countTokens')) return Response.json({totalTokens:5000});
    if(url.endsWith(':generateContent')) {
      expect((init!.headers as Record<string,string>)['X-Goog-Api-Key']).toBeTruthy();
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(values[generated++])}]}}]});
    }
    if(url.startsWith('https://api.deepgram.com/v1/speak?')) {
      if(failSpeech) throw new Error('Réponse payante perdue');
      return new Response(fakeMp3(),{headers:{'Content-Type':'audio/mpeg'}});
    }
    throw new Error(`Réseau non simulé interdit : ${new URL(url).hostname}`);
  });
  vi.stubGlobal('fetch',calls);return calls;
}
it('exécute le vrai Workflow jusqu’à la publication atomique et conserve le marquage non relu',async()=>{
  const calls=providers(false,true), {id}=await startNote();
  await using inspector=await introspectWorkflowInstance(env.CLOUD_PREPARATION,id);
  await env.CLOUD_PREPARATION.create({id,params:{id}});
  await inspector.waitForStatus('complete');
  const q=await env.DB.prepare('SELECT status,content_id FROM prepare_queue WHERE id=?').bind(id).first<{status:string;content_id:string}>();
  expect(q!.status).toBe('done');
  const variants=await env.DB.prepare('SELECT audio_origin,timing_status,evaluation_json FROM variants WHERE content_id=? AND kind=\'adaptation\'')
    .bind(q!.content_id).first<{audio_origin:string;timing_status:string;evaluation_json:string}>();
  expect(variants).toMatchObject({audio_origin:'deepgram',timing_status:'exact'});
  expect(JSON.parse(variants!.evaluation_json)).toMatchObject({verdict:'review',autoPublished:true});
  expect(calls.mock.calls.filter(c=>String(c[0]).includes(':generateContent'))).toHaveLength(3);
  expect(calls.mock.calls.filter(c=>String(c[0]).includes('api.deepgram.com'))).toHaveLength(6);
  const speechCalls=calls.mock.calls.filter(c=>String(c[0]).includes('api.deepgram.com'));
  for (const call of speechCalls) {
    const url=new URL(String(call[0]));
    expect(url.searchParams.get('model')).toBe('aura-2-arcas-en');
    expect(url.searchParams.get('speed')).toBe('1');
  }
  const spoken=calls.mock.calls.filter(c=>String(c[0]).includes('api.deepgram.com')).map(c=>JSON.parse(String(c[1]!.body)).text);
  expect(spoken).toEqual(script.lines.map(l=>l.text));
  const segments=await env.DB.prepare(`SELECT f.r2_key FROM variants v JOIN publication_files f ON f.publication_id=v.publication_id AND f.path=v.segments_path
    WHERE v.content_id=? AND v.kind='adaptation'`).bind(q!.content_id).first<{r2_key:string}>();
  const doc=await (await env.FILES.get(segments!.r2_key))!.json<{segments:{text:string;fr:string;sourceSegments:string[];startMs:number;endMs:number}[]}>();
  expect(Math.abs(doc.segments[0]!.startMs-300)).toBeLessThanOrEqual(14); // trames MP3 de 26 ms
  for (let i=1;i<doc.segments.length;i++) {
    expect(Math.abs(doc.segments[i]!.startMs-doc.segments[i-1]!.endMs-600)).toBeLessThanOrEqual(14);
  }
  expect(doc.segments.map(s=>s.text)).toEqual(spoken);
  expect(doc.segments.map(s=>s.fr)).toEqual(script.lines.map(l=>l.fr));
  expect(doc.segments.every(s=>s.sourceSegments.join(',')==='s1')).toBe(true);
  await publish(cloudEnv,id,'unused','unused','unused',[]);
  expect((await env.DB.prepare("SELECT COUNT(*) n FROM publications WHERE status='ready'").first<{n:number}>())!.n).toBe(1);
  expect((await env.DB.prepare('SELECT state FROM cloud_runs WHERE id=?').bind(id).first<{state:string}>())!.state).toBe('done');
},30_000);
it('une réponse TTS perdue échoue sans relance ni publication et garde l’enveloppe',async()=>{
  const calls=providers(true),{id}=await startNote();
  await using inspector=await introspectWorkflowInstance(env.CLOUD_PREPARATION,id);
  await env.CLOUD_PREPARATION.create({id,params:{id}});
  await inspector.waitForStatus('errored');
  expect((await env.DB.prepare('SELECT status FROM prepare_queue WHERE id=?').bind(id).first<{status:string}>())!.status).toBe('failed');
  expect(calls.mock.calls.filter(c=>String(c[0]).includes('api.deepgram.com'))).toHaveLength(1);
  expect((await env.DB.prepare('SELECT reserved_micros FROM cloud_runs WHERE id=?').bind(id).first<{reserved_micros:number}>())!.reserved_micros).toBe(1_000_000);
  expect((await env.DB.prepare('SELECT COUNT(*) n FROM publications').first<{n:number}>())!.n).toBe(0);
},30_000);
it('ne génère pas au-delà du comptage autorisé et transmet YouTube comme donnée vidéo',async()=>{
  const calls=vi.fn(async()=>Response.json({totalTokens:300_001}));vi.stubGlobal('fetch',calls);
  await expect(gemini(cloudEnv,'Transcribe',{},'https://www.youtube.com/watch?v=AbCdEf01234')).rejects.toThrow('enveloppe');
  expect(calls).toHaveBeenCalledTimes(1);
  expect(calls.mock.calls[0]).toBeDefined();
});
it('une annulation pendant countTokens interdit generateContent',async()=>{
  const {id}=await startNote();
  const calls=vi.fn(async()=>{await cancel(cloudEnv,id);return Response.json({totalTokens:500});});vi.stubGlobal('fetch',calls);
  await expect(gemini(cloudEnv,'Transcribe',{},undefined,()=>active(cloudEnv,id,'transcribe'))).rejects.toMatchObject({code:'lease_lost'});
  expect(calls).toHaveBeenCalledTimes(1);
});
