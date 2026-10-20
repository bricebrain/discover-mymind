/// <reference lib="esnext.disposable" />
import { env } from 'cloudflare:workers';
import { introspectWorkflowInstance } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupCloud, cloudCall, options, cloudEnv, body, script, fakeMp3 } from './cloud-fixtures';
import { uploadPodcast } from '../src/cloud/podcast';

const EP='c'.repeat(20), AUDIO='https://podcasts.example.com/episode.mp3';
const GOOGLE='https://generativelanguage.googleapis.com';
const FILE={name:'files/podcast123',uri:`${GOOGLE}/v1beta/files/podcast123`};
const target={kind:'episode',id:EP};
beforeEach(async()=>{
  await setupCloud();
  await env.DB.prepare("INSERT OR IGNORE INTO shows(id,title,feed_url,language,category,next_check_at,created_at) VALUES ('cloud-podcast','Mon podcast','https://podcasts.example.com/rss','fr','news','2026-01-01','2026-01-01')").run();
  await env.DB.prepare('DELETE FROM episodes WHERE show_id=?').bind('cloud-podcast').run();
  await env.DB.prepare("INSERT INTO episodes(id,show_id,guid,title,audio_url,duration_sec,created_at) VALUES (?,'cloud-podcast','cloud-episode','Épisode cloud',?,1200,'2026-01-01')").bind(EP,AUDIO).run();
});
afterEach(()=>vi.unstubAllGlobals());
async function startPodcast() {
  const quote=await (await cloudCall('quotes',{target,options})).json<{id:string}>();
  return (await cloudCall('runs',{quoteId:quote.id,acceptedMicros:1_000_000})).json<{id:string}>();
}
it('fige les métadonnées officielles sans réseau et refuse durée absente, excessive, URL privée et versions existantes',async()=>{
  const http=vi.fn(()=>{throw new Error('Réseau interdit au devis');});vi.stubGlobal('fetch',http);
  expect(await (await cloudCall('quotes',{target,options})).json()).toMatchObject({title:'Épisode cloud',durationSec:1200,attribution:'Mon podcast'});
  expect(http).not.toHaveBeenCalled();
  for (const duration of [null,0,9,1801]) {
    await env.DB.prepare('UPDATE episodes SET duration_sec=? WHERE id=?').bind(duration,EP).run();
    await expect(cloudCall('quotes',{target,options})).rejects.toMatchObject({code:'cloud_podcast_duration'});
  }
  await env.DB.prepare("UPDATE episodes SET duration_sec=600,audio_url='https://localhost/audio.mp3' WHERE id=?").bind(EP).run();
  await expect(cloudCall('quotes',{target,options})).rejects.toMatchObject({code:'cloud_source_url'});
  await env.DB.prepare('UPDATE episodes SET audio_url=? WHERE id=?').bind(AUDIO,EP).run();
  await env.DB.prepare("INSERT INTO contents(id,title,original_language,source_type,source_ref,created_at,updated_at) VALUES ('old-podcast','Déjà prêt','fr','podcast',?,'2026-01-01','2026-01-01')").bind(`episode:${EP}`).run();
  await expect(cloudCall('quotes',{target,options})).rejects.toMatchObject({code:'cloud_existing_source'});
});
it('refuse un audio trop gros, sans taille ou non audio avant tout envoi à Gemini',async()=>{
  const {id}=await startPodcast();
  const cases:Record<string,string>[]=[
    {'Content-Length':'80000001','Content-Type':'audio/mpeg'},
    {'Content-Type':'audio/mpeg'},
    {'Content-Length':'3','Content-Type':'text/html'},
  ];
  for (const headers of cases) {
    const http=vi.fn(async()=>new Response('abc',{headers}));vi.stubGlobal('fetch',http);
    await expect(uploadPodcast(cloudEnv,id,AUDIO)).rejects.toThrow('Audio podcast indisponible');
    expect(http).toHaveBeenCalledTimes(1);
  }
});
it('ne suit pas une redirection audio interne et ne transmet aucune clé à l’éditeur',async()=>{
  const {id}=await startPodcast();
  const http=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/audio'}}));vi.stubGlobal('fetch',http);
  await expect(uploadPodcast(cloudEnv,id,AUDIO)).rejects.toMatchObject({code:'unsafe_url'});
  expect(http).toHaveBeenCalledTimes(1);
  expect(http.mock.calls[0]![1]?.headers).toBeUndefined();
});
it('refuse un serveur d’upload Gemini inattendu',async()=>{
  const {id}=await startPodcast();
  const http=vi.fn(async(input:RequestInfo|URL)=>String(input)===AUDIO
    ? new Response('abc',{headers:{'Content-Length':'3','Content-Type':'audio/mpeg'}})
    : new Response(null,{headers:{'X-Goog-Upload-URL':'https://other.example.com/upload/'}}));
  vi.stubGlobal('fetch',http);
  await expect(uploadPodcast(cloudEnv,id,AUDIO)).rejects.toThrow('Envoi audio Gemini refusé');
  expect(http).toHaveBeenCalledTimes(2);
});
it('prépare un podcast dans le vrai Workflow, publie son audio et le rattache à l’épisode',async()=>{
  let generated=0;
  const values=[{language:'fr',paragraphs:[body]},script,{verdict:'ok',reasons:[]}];
  const http=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if (url===AUDIO) return new Response('abc',{headers:{'Content-Type':'audio/mpeg','Content-Length':'3'}});
    if (url===`${GOOGLE}/upload/v1beta/files`) return new Response(null,{headers:{'X-Goog-Upload-URL':`${GOOGLE}/upload/v1beta/files?upload_id=test`}});
    if (url.includes('upload_id=test')) {
      expect(await new Response(init!.body).text()).toBe('abc');
      return Response.json({file:FILE});
    }
    if (url===FILE.uri) return init?.method==='DELETE' ? new Response(null,{status:200}) : Response.json({state:'ACTIVE'});
    if (url.endsWith(':countTokens')) {
      const data=JSON.parse(String(init!.body));
      if (generated===0) expect(data.contents[0].parts[0]).toEqual({fileData:{fileUri:FILE.uri,mimeType:'audio/mpeg'}});
      return Response.json({totalTokens:5000});
    }
    if (url.endsWith(':generateContent')) return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(values[generated++])}]}}]});
    if (url.startsWith('https://api.deepgram.com/v1/speak?')) return new Response(fakeMp3(),{headers:{'Content-Type':'audio/mpeg'}});
    throw new Error('Réseau non simulé');
  });
  vi.stubGlobal('fetch',http);
  const {id}=await startPodcast();
  await using inspector=await introspectWorkflowInstance(env.CLOUD_PREPARATION,id);
  await env.CLOUD_PREPARATION.create({id,params:{id}});
  await inspector.waitForStatus('complete');
  const episode=await env.DB.prepare('SELECT content_id FROM episodes WHERE id=?').bind(EP).first<{content_id:string}>();
  expect(episode!.content_id).toBeTruthy();
  expect(await env.DB.prepare('SELECT source_type,source_ref FROM contents WHERE id=?').bind(episode!.content_id).first())
    .toMatchObject({source_type:'podcast',source_ref:`episode:${EP}`});
  expect(await env.DB.prepare('SELECT status,executor FROM prepare_queue WHERE id=?').bind(id).first()).toMatchObject({status:'done',executor:'cloud'});
  expect(generated).toBe(3);
  expect(http.mock.calls.filter(c=>String(c[0])===AUDIO)).toHaveLength(1);
  expect(await env.FILES.head(`cloud/${id}/podcast-audio`)).toBeNull();
  expect(http.mock.calls.some(c=>String(c[0])===FILE.uri && c[1]?.method==='DELETE')).toBe(true);
},30_000);
