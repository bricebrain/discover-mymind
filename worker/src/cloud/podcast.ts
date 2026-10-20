import type { Env } from '../env';
import { safeFetch } from '../security/safeUrl';
import { boundedJson } from './transport';
import type { GeminiMedia } from './gemini';
import { active } from './store';

const MAX_BYTES=80_000_000;
const GOOGLE='https://generativelanguage.googleapis.com';
const MIME_TYPES=new Set(['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/flac']);
export interface PodcastFile extends GeminiMedia { name:string }

/** Audio officiel uniquement ; transfert borné en streaming, sans cookies ni clés vers l'éditeur. */
export async function uploadPodcast(env:Env,id:string,url:string):Promise<PodcastFile> {
  await active(env,id,'transcribe');
  const key=`cloud/${id}/podcast-audio`;
  let stored=await env.FILES.head(key);
  if (!stored) {
    const response=await safeFetch(url,{timeoutMs:180_000,maxRedirects:5});
    const size=Number(response.headers.get('Content-Length'));
    const mime=response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (!response.ok || !response.body || !Number.isSafeInteger(size) || size<1 || size>MAX_BYTES || !mime || !MIME_TYPES.has(mime)) {
      await response.body?.cancel();
      throw new Error('Audio podcast indisponible : format audio reconnu et taille annoncée de 80 Mo maximum requis.');
    }
    const {readable,writable}=new FixedLengthStream(size);
    await Promise.all([
      response.body.pipeTo(writable),
      env.FILES.put(key,readable,{httpMetadata:{contentType:mime}}),
    ]);
    stored=await env.FILES.head(key);
  }
  if (!stored || stored.size<1 || stored.size>MAX_BYTES) throw new Error('Audio podcast incomplet.');
  await active(env,id,'transcribe');
  const mimeType=stored.httpMetadata?.contentType;
  if (!mimeType || !MIME_TYPES.has(mimeType)) throw new Error('Format audio podcast inconnu.');
  const headers={'X-Goog-Api-Key':env.GEMINI_API_KEY!};
  const start=await fetch(`${GOOGLE}/upload/v1beta/files`,{method:'POST',headers:{...headers,
    'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start',
    'X-Goog-Upload-Header-Content-Length':String(stored.size),'X-Goog-Upload-Header-Content-Type':mimeType},
    redirect:'error',signal:AbortSignal.timeout(30_000),body:JSON.stringify({file:{display_name:`discover-${id}`}})});
  const uploadUrl=start.headers.get('X-Goog-Upload-URL');
  await start.body?.cancel();
  if (!start.ok || !uploadUrl || !googleUrl(uploadUrl,'/upload/')) throw new Error('Envoi audio Gemini refusé.');
  await active(env,id,'transcribe');
  const audio=await env.FILES.get(key);
  if (!audio) throw new Error('Audio podcast manquant.');
  const result=await boundedJson(await fetch(uploadUrl,{method:'POST',headers:{
    'Content-Length':String(audio.size),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},
    body:audio.body,redirect:'error',signal:AbortSignal.timeout(180_000)})) as {file?:{name?:unknown;uri?:unknown}};
  const file=result.file;
  if (typeof file?.name!=='string' || !/^files\/[a-zA-Z0-9_-]+$/.test(file.name) ||
      typeof file.uri!=='string' || !googleUrl(file.uri,'/v1beta/files/')) throw new Error('Fichier Gemini invalide.');
  return {name:file.name,fileUri:file.uri,mimeType};
}

function googleUrl(raw:string,prefix:string) {
  try {const url=new URL(raw);return url.origin===GOOGLE && url.pathname.startsWith(prefix) && !url.username && !url.password;}
  catch {return false;}
}

export async function podcastReady(env:Env,id:string,file:PodcastFile) {
  await active(env,id,'transcribe');
  const data=await boundedJson(await fetch(`${GOOGLE}/v1beta/${file.name}`,{headers:{'X-Goog-Api-Key':env.GEMINI_API_KEY!},
    redirect:'error',signal:AbortSignal.timeout(15_000)})) as {state?:string};
  if (data.state!=='ACTIVE') throw new Error('Audio Gemini en traitement ou indisponible.');
}

export async function removePodcastAudio(env:Env,id:string,file:PodcastFile) {
  const response=await fetch(`${GOOGLE}/v1beta/${file.name}`,{method:'DELETE',headers:{'X-Goog-Api-Key':env.GEMINI_API_KEY!},
    redirect:'error',signal:AbortSignal.timeout(15_000)});
  await response.body?.cancel();
  if (!response.ok && response.status!==404) throw new Error('Suppression audio Gemini différée.');
  await env.FILES.delete(`cloud/${id}/podcast-audio`);
}
