import type { Env } from '../env';
import { sha256Hex } from '../security/crypto';
import type { Manifest, Segments } from '../publications/types';
import { declare } from '../publications/declaration';
import { upload } from '../publications/upload';
import { commit } from '../publications/commit';
import { current, manifest, publication } from '../publications/store';
import { active, run } from './store';
import { checkpoint } from './operations';
import { concat, mp3Frames } from './mp3';
import { MODEL, VOICE, type Judge, type Script, type Snapshot, type SourceText } from './types';

export async function publish(env:Env,id:string,sourceKey:string,scriptKey:string,judgeKey:string,audioKeys:string[]) {
  const row=await run(env,id);
  const done=await env.DB.prepare("SELECT content_id FROM prepare_queue WHERE id=? AND status='done'").bind(id).first();
  if (done) {
    await env.DB.prepare("UPDATE cloud_runs SET state='done',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run();
    return;
  }
  await active(env,id,'publish');
  const {source,options}=JSON.parse(row.snapshot_json) as Snapshot;
  const sourceText=await checkpoint<SourceText>(env,sourceKey), script=await checkpoint<Script>(env,scriptKey), judge=await checkpoint<Judge>(env,judgeKey);
  const sourceRef=`${source.kind}:${source.ref}`;
  // Réutiliser le contenu de cette source, y compris s'il a d'abord été publié depuis le Mac.
  const known=await env.DB.prepare('SELECT id FROM contents WHERE source_ref=? ORDER BY created_at LIMIT 1').bind(sourceRef).first<{id:string}>();
  const contentId=known?.id ?? `cloud-${(await sha256Hex(sourceRef)).slice(0,32)}`;
  const oldId=await current(env,contentId), old=oldId ? await manifest(env,await publication(env,oldId)) : null;
  // Un nouveau texte source pourrait invalider les références des anciennes adaptations : ne pas l'écraser.
  // Cette première version exige une source identique lors d'un ajout de niveau.
  const original=old?.variants.find(v=>v.kind==='source');
  const sourceVariant=original?.key ?? 'source';
  const sourceDoc:Segments={schemaVersion:1,variantKey:sourceVariant,segments:sourceText.paragraphs.map((text,i)=>({id:`s${i+1}`,text,startMs:null,endMs:null}))};
  if (original) {
    const object=await env.FILES.get(`blobs/${old!.files[original.segmentsFile]!.sha256}`);
    const prior=await object?.json<Segments>();
    if (!prior || JSON.stringify(prior.segments)!==JSON.stringify(sourceDoc.segments)) throw new Error('Une autre version de cette source existe déjà ; conserver sa préparation dans l’Atelier Mac.');
  }
  const key=`cloud-en-${options.level.toLowerCase()}-4`, sourcePath=original?.segmentsFile ?? 'source.json';
  let samples=0;
  const chunks:Uint8Array[]=[], segments:Segments['segments']=[];
  if (audioKeys.length!==script.lines.length) throw new Error('Fragments audio incomplets.');
  for (let i=0;i<audioKeys.length;i++) {
    const audio=await env.FILES.get(audioKeys[i]!);
    if (!audio) throw new Error('Fragment audio manquant.');
    const frame=mp3Frames(new Uint8Array(await audio.arrayBuffer())), startMs=Math.round(samples/22.05);
    samples+=frame.samples; chunks.push(frame.bytes);
    segments.push({id:`a${i+1}`,...script.lines[i]!,speaker:'Narrator',startMs,endMs:Math.round(samples/22.05)});
  }
  const durationMs=Math.round(samples/22.05);
  if (durationMs<1 || durationMs>420_000) throw new Error('Durée vocale hors cible : résultat conservé, aucune régénération payante.');
  const newFiles:Record<string,{bytes:Uint8Array;contentType:string}>={
    [sourcePath]:{bytes:new TextEncoder().encode(JSON.stringify(sourceDoc)),contentType:'application/json'},
    [`${key}.json`]:{bytes:new TextEncoder().encode(JSON.stringify({schemaVersion:1,variantKey:key,segments})),contentType:'application/json'},
    [`${key}.mp3`]:{bytes:concat(chunks),contentType:'audio/mpeg'},
  };
  const m:Manifest={schemaVersion:1,content:{id:contentId,title:source.title,sourceType:source.kind,sourceRef,
    originalLanguage:sourceText.language,sourceUrl:source.url,rights:'personal_use',editorial:'discovery'},
    variants:[...(old?.variants.filter(v=>v.key!==key) ?? [{key:sourceVariant,kind:'source' as const,language:sourceText.language,segmentsFile:sourcePath,
      generation:{executor:'cloud',transcription:source.kind==='youtube' ? 'gemini_unverified' : 'saved_text',attribution:source.attribution}}]),
      {key,kind:'adaptation',language:'en',cefrLevel:options.level==='original' ? null : options.level,style:'narration',coverage:'essentials',derivedFrom:sourceVariant,
        condensation:{targetMinutes:4,sourceMinutes:source.durationSec ? source.durationSec/60 : Math.max(1,sourceText.paragraphs.join(' ').split(/\s+/).length/130),excludeAds:true},
        segmentsFile:`${key}.json`,audio:{source:'r2',file:`${key}.mp3`,origin:'deepgram',timingSource:'deepgram',durationMs},
        generation:{executor:'cloud',model:MODEL,voice:VOICE,sourceTranscriptionVerified:false,attribution:source.attribution},
        evaluation:{...judge,autoPublished:judge.verdict!=='ok'}}],files:{...old?.files}};
  // Éliminer les anciens fichiers d'une variante remplacée, sans supprimer d'autre version.
  const used=new Set(m.variants.flatMap(v=>[v.segmentsFile,...(v.audio?.file ? [v.audio.file] : [])]));
  for (const path of Object.keys(m.files)) if (!used.has(path)) delete m.files[path];
  for (const [path,f] of Object.entries(newFiles)) {
    if (path===sourcePath && original) { delete newFiles[path]; continue; }
    m.files[path]={sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',f.bytes)),b=>b.toString(16).padStart(2,'0')).join(''),size:f.bytes.byteLength,contentType:f.contentType};
  }
  const response=await declare(new Request('https://internal/declaration',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({manifest:m,queueItemId:id,leaseToken:row.lease_token})}),env);
  const declared=await response.json<{publicationId:string;status:string;missing:string[]}>();
  if (declared.status!=='ready') {
    for (const path of declared.missing) {
      const f=newFiles[path];
      if (!f) throw new Error('Ancien fichier de publication indisponible.');
      const uploaded=await upload(new Request('https://internal/upload',{method:'PUT',headers:{'Content-Type':f.contentType,
        'Content-Length':String(f.bytes.byteLength),'x-content-sha256':m.files[path]!.sha256,'X-Discover-Lease-Token':row.lease_token},body:f.bytes}),env,declared.publicationId,path);
      if (!uploaded.ok) throw new Error('Envoi de publication refusé.');
    }
    const committed=await commit(env,declared.publicationId,row.lease_token);
    if (!committed.ok) throw new Error('Publication incomplète.');
  }
  await env.DB.prepare("UPDATE cloud_runs SET state='done',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run();
}
