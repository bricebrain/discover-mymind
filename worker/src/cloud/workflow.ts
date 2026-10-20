import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { Env } from '../env';
import { gemini } from './gemini';
import { SOURCE_PROMPT, SCRIPT_PROMPT, JUDGE_PROMPT, validateSource, validateScript, validateJudge } from './editorial';
import { operation, checkpoint } from './operations';
import { speak } from './speech';
import { mp3Frames } from './mp3';
import { active, fail } from './store';
import { publish } from './publish';
import type { Script, Snapshot, SourceText } from './types';
import { flushEvents } from '../events/hub';
import { prepareSpokenScript } from './scripts';
import { uploadPodcast, podcastReady, removePodcastAudio, type PodcastFile } from './podcast';

const SPEECH_PARALLEL=4;
/** Attend toutes les étapes lancées avant de signaler un échec : jamais d'arrêt pendant un envoi en vol. */
async function settled<T>(tasks:Promise<T>[]) {
  const results=await Promise.allSettled(tasks);
  const failure=results.find(r=>r.status==='rejected');
  if (failure) throw failure.reason;
  return results.map(r=>(r as PromiseFulfilledResult<T>).value);
}
const paidStep={retries:{limit:0,delay:'1 second' as const},timeout:'5 minutes' as const};
const encode=(value:unknown) => new TextEncoder().encode(JSON.stringify(value));

export class CloudPreparation extends WorkflowEntrypoint<Env,{id:string}> {
  override async run(event:WorkflowEvent<{id:string}>,step:WorkflowStep) {
    const id=event.payload.id;
    try {
      const captured=await step.do('intention',async()=>{
        const row=await active(this.env,id,'transcribe');
        const snapshot=JSON.parse(row.snapshot_json) as Snapshot;
        if (await this.env.DB.prepare('SELECT id FROM contents WHERE source_ref=? LIMIT 1')
          .bind(`${snapshot.source.kind}:${snapshot.source.ref}`).first()) throw new Error('Source déjà préparée.');
        await this.env.DB.prepare("UPDATE cloud_runs SET state='running',updated_at=? WHERE id=? AND state='reserved'")
          .bind(new Date().toISOString(),id).run();
        return snapshot;
      });
      let podcast:PodcastFile|undefined;
      if (captured.source.kind==='episode') {
        const fileKey=await step.do('audio-podcast',paidStep,()=>operation(this.env,id,'podcast-file','transcribe',async()=>
          encode(await uploadPodcast(this.env,id,captured.source.url!))));
        podcast=await step.do('fichier-podcast',()=>checkpoint<PodcastFile>(this.env,fileKey));
        const file=podcast;
        await step.do('audio-podcast-disponible',{retries:{limit:5,delay:'10 seconds'},timeout:'30 seconds'},()=>podcastReady(this.env,id,file));
      }
      const media=podcast ?? (captured.source.kind==='youtube' ? captured.source.url! : undefined);
      const sourceKey=await step.do('source',paidStep,()=>operation(this.env,id,'source','transcribe',async()=>{
        const raw=await gemini(this.env,SOURCE_PROMPT,{text:captured.source.text},media,()=>active(this.env,id,'transcribe'));
        return encode(validateSource(JSON.parse(new TextDecoder().decode(raw)),captured));
      }));
      const generatedScriptKey=await step.do('adaptation',paidStep,()=>operation(this.env,id,'script','adapt',async()=>{
        const source=await checkpoint<SourceText>(this.env,sourceKey);
        const paragraphs=source.paragraphs.map((text,i)=>({id:`s${i+1}`,text}));
        const raw=await gemini(this.env,SCRIPT_PROMPT,{level:captured.options.level,source:paragraphs,attribution:captured.source.attribution},undefined,()=>active(this.env,id,'adapt'));
        return encode(validateScript(JSON.parse(new TextDecoder().decode(raw)),source));
      }));
      const scriptKey=await step.do('texte-propre-v2',()=>prepareSpokenScript(this.env,id,sourceKey,generatedScriptKey));
      // Le contrôle ne bloque pas la publication (il marque seulement « non relu ») :
      // il tourne pendant la voix, sous l'étape « tts » pour garder un suivi lisible.
      const judging=step.do('controle',paidStep,()=>operation(this.env,id,'judge','tts',async()=>{
        const source=await checkpoint<SourceText>(this.env,sourceKey), script=await checkpoint<Script>(this.env,scriptKey);
        const raw=await gemini(this.env,JUDGE_PROMPT,{source,script,level:captured.options.level},undefined,()=>active(this.env,id,'tts'));
        return encode(validateJudge(JSON.parse(new TextDecoder().decode(raw))));
      }));
      const count=await step.do('nombre-passages',async()=> (await checkpoint<Script>(this.env,scriptKey)).lines.length);
      const voice=(i:number)=>step.do(`voix-${i}`,paidStep,()=>operation(this.env,id,`speech-${i}`,'tts',async()=>{
        const script=await checkpoint<Script>(this.env,scriptKey);
        await active(this.env,id,'tts');
        const audio=await speak(this.env,script.lines[i]!.text);
        mp3Frames(audio); // Valider avant le checkpoint ; aucune réparation payante implicite.
        return audio;
      }));
      const speaking=(async()=>{
        const keys:string[]=[];
        // Passages envoyés par groupes : même coût, attente divisée ; un échec arrête les groupes suivants.
        for (let i=0;i<count;i+=SPEECH_PARALLEL) {
          keys.push(...await settled(Array.from({length:Math.min(SPEECH_PARALLEL,count-i)},(_,j)=>voice(i+j))));
        }
        return keys;
      })();
      const [judgeKey,audioKeys]=await settled<string|string[]>([judging,speaking]) as [string,string[]];
      await step.do('publication',()=>publish(this.env,id,sourceKey,scriptKey,judgeKey,audioKeys));
      if (podcast) {
        const file=podcast;
        await step.do('liberer-audio-podcast',async()=>{
          // Un nettoyage indisponible ne doit pas invalider une publication terminée.
          // Google expire ses fichiers ; la rétention R2 existante reste applicable.
          try {await removePodcastAudio(this.env,id,file);return true;} catch {return false;}
        });
      }
      await step.do('notification',()=>flushEvents(this.env));
      return {id,status:'done'};
    } catch {
      await step.do('arret',()=>fail(this.env,id));
      await step.do('notification-arret',()=>flushEvents(this.env));
      throw new Error('Préparation cloud arrêtée ; consulter la file dans Discover.');
    }
  }
}
