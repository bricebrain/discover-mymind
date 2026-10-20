import { env } from 'cloudflare:workers';
import { vi } from 'vitest';
import type { Env } from '../src/env';
import { cloudRoute } from '../src/cloud/routes';
import { createSession, SESSION_COOKIE } from '../src/security/session';
import { CLOUD_OPTIONS, type Snapshot } from '../src/cloud/types';

export const NOTE='12345678-1234-1234-1234-123456789012';
export const body='La société a annoncé un projet. Les résultats restent incertains. '.repeat(30).trim();
export const options={...CLOUD_OPTIONS,level:'B1' as const};
const noDispatch=async()=>{throw new Error('Dispatch simulé indisponible');};
export const create=vi.fn(noDispatch);
export const cloudEnv:Env={...env,AUTH_DISABLED:'true',CLOUD_ATELIER_ENABLED:'true',CLOUD_MONTHLY_USD:'10',
  GEMINI_API_KEY:'fake-gemini',DEEPGRAM_API_KEY:'fake-deepgram',YOUTUBE_DATA_API_KEY:'fake-youtube',
  CLOUD_PREPARATION:{create,get:noDispatch,createBatch:noDispatch,deleteBatch:noDispatch}};
export let owner='';
export async function setupCloud() {
  await env.DB.batch(['DELETE FROM cloud_operations','DELETE FROM cloud_runs','DELETE FROM cloud_quotes','DELETE FROM prepare_queue',
    'DELETE FROM variants','DELETE FROM publication_files','DELETE FROM contents','DELETE FROM publications','DELETE FROM reflections',
    'DELETE FROM sessions','DELETE FROM login_attempts'].map(s=>env.DB.prepare(s)));
  await env.DB.prepare(`INSERT INTO reflections(id,title,body_md,kind,tags_json,created_at,updated_at) VALUES (?,'Ma note',?,'observation','[]','2026-01-01','2026-01-01')`)
    .bind(NOTE,body).run();
  const {token}=await createSession(cloudEnv,new Request('https://discover.test'));
  owner=`${SESSION_COOKIE}=${token}`;create.mockClear();
}
export const cloudRequest=(path:string,data?:unknown,cookie=owner)=>new Request(`https://discover.test/api/cloud/${path}`,{
  method:data===undefined ? 'GET' : 'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://discover.test','X-Discover-Client':'1'},
  body:data===undefined ? undefined : JSON.stringify(data),
});
export const cloudCall=(path:string,data?:unknown,cookie=owner)=>cloudRoute(cloudRequest(path,data,cookie),cloudEnv,`/api/cloud/${path}`);
export async function quoteNote(ref=NOTE) {
  return (await cloudCall('quotes',{target:{kind:'reflection',id:ref},options})).json<{id:string}>();
}
export async function startNote() {
  const quote=await quoteNote();
  return (await cloudCall('runs',{quoteId:quote.id,acceptedMicros:1_000_000})).json<{id:string}>();
}
export const captured:Snapshot={source:{kind:'reflection',ref:NOTE,title:'Ma note',text:body,url:null,durationSec:null,attribution:null},
  options:{...CLOUD_OPTIONS,level:'B1'},version:'cloud-v1'};
export const script={lines:Array.from({length:6},()=>({text:'The company announced a new project but its results are still uncertain and the available evidence needs careful examination before we can draw any firm conclusions about its wider impact on the economy or the people involved in the decision and the subsequent development of these activities in the coming years because the available information remains limited and does not yet provide a reliable forecast.',
  fr:'La société a annoncé un projet dont les résultats restent incertains.',sourceSegments:['s1']}))};
/** Trames structurelles factices : vérifient l'assemblage, pas la qualité sonore. */
export function fakeMp3(frames=1150) {
  const bytes=new Uint8Array(frames*156);
  for(let i=0;i<frames;i++) bytes.set([255,243,96,192],i*156);
  return bytes;
}
