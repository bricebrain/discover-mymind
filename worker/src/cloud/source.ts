import type { Env } from '../env';
import { HttpError } from '../http';
import { prepareOptions } from '../queue/options';
import { boundedJson } from './transport';
import { parseSafeUrl } from '../security/safeUrl';
import { CLOUD_OPTIONS, type CloudSource, type Snapshot } from './types';

export async function snapshot(env: Env, body: Record<string, unknown>): Promise<Snapshot> {
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new HttpError(422,'invalid_source','Source attendue.');
  const target = body.target as { kind?: unknown; id?: unknown } | null;
  if (!target || typeof target.id !== 'string') throw new HttpError(422,'invalid_source','Source attendue.');
  const options = prepareOptions(body.options ?? {},'fr',null);
  if (Object.entries(CLOUD_OPTIONS).some(([key,value]) => options[key as keyof typeof options]!==value)) {
    throw new HttpError(422,'cloud_options','Sans Mac : narration essentielle de 4 minutes, sans copie originale ni version fidèle.');
  }
  let source: CloudSource;
  if (target.kind==='reflection' && /^[0-9a-f-]{36}$/.test(target.id)) {
    const note = await env.DB.prepare(`SELECT title,body_md,source_name,source_url FROM reflections WHERE id=? AND deleted_at IS NULL`)
      .bind(target.id).first<{ title:string|null; body_md:string; source_name:string|null; source_url:string|null }>();
    if (!note) throw new HttpError(404,'not_found','Note introuvable.');
    if (note.body_md.trim().length<100 || note.body_md.length>20_000) throw new HttpError(422,'cloud_text_size','Le texte enregistré doit contenir entre 100 et 20 000 caractères.');
    source = { kind:'reflection',ref:target.id,title:note.title || 'Note My Mind',text:note.body_md,
      url:note.source_url,durationSec:null,attribution:note.source_name };
  } else if (target.kind==='youtube' && /^[A-Za-z0-9_-]{11}$/.test(target.id)) {
    if (!env.YOUTUBE_DATA_API_KEY) throw new HttpError(503,'youtube_config','La vérification YouTube n’est pas configurée.');
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${target.id}`,{
      headers:{ 'X-Goog-Api-Key':env.YOUTUBE_DATA_API_KEY },redirect:'manual',signal:AbortSignal.timeout(15_000),
    });
    const data = await boundedJson(response,100_000) as { items?: { snippet?:{title?:string;channelTitle?:string;liveBroadcastContent?:string}; contentDetails?:{duration?:string};status?:{privacyStatus?:string;uploadStatus?:string} }[] };
    const video = data.items?.[0], d=video?.contentDetails?.duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    const seconds=d ? Number(d[1] ?? 0)*3600+Number(d[2] ?? 0)*60+Number(d[3] ?? 0) : 0;
    if (!video?.snippet?.title || video.status?.privacyStatus!=='public' || video.status.uploadStatus!=='processed' ||
        video.snippet.liveBroadcastContent!=='none' || seconds<10 || seconds>900) {
      throw new HttpError(422,'youtube_unavailable','Choisis une vidéo publique terminée, de 10 secondes à 15 minutes.');
    }
    source = {kind:'youtube',ref:target.id,title:video.snippet.title.slice(0,500),text:null,
      url:`https://www.youtube.com/watch?v=${target.id}`,durationSec:seconds,attribution:video.snippet.channelTitle ?? null};
  } else throw new HttpError(422,'cloud_source','Sans Mac : note enregistrée ou lien YouTube public uniquement.');
  if (source.url) {
    try {parseSafeUrl(source.url);}
    catch {throw new HttpError(422,'cloud_source_url','La source doit posséder un lien HTTPS public ou aucun lien.');}
  }
  if (await env.DB.prepare('SELECT id FROM contents WHERE source_ref=? LIMIT 1').bind(`${source.kind}:${source.ref}`).first()) {
    throw new HttpError(409,'cloud_existing_source','Cette source possède déjà des versions. Utilise l’Atelier Mac pour les compléter dans ce premier lot.');
  }
  return {source,options,version:'cloud-v1'};
}
