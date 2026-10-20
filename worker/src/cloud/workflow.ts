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
      const sourceKey=await step.do('source',paidStep,()=>operation(this.env,id,'source','transcribe',async()=>{
        const raw=await gemini(this.env,SOURCE_PROMPT,{text:captured.source.text},captured.source.kind==='youtube' ? captured.source.url! : undefined,()=>active(this.env,id,'transcribe'));
        return encode(validateSource(JSON.parse(new TextDecoder().decode(raw)),captured));
      }));
      const scriptKey=await step.do('adaptation',paidStep,()=>operation(this.env,id,'script','adapt',async()=>{
        const source=await checkpoint<SourceText>(this.env,sourceKey);
        const paragraphs=source.paragraphs.map((text,i)=>({id:`s${i+1}`,text}));
        const raw=await gemini(this.env,SCRIPT_PROMPT,{level:captured.options.level,source:paragraphs,attribution:captured.source.attribution},undefined,()=>active(this.env,id,'adapt'));
        return encode(validateScript(JSON.parse(new TextDecoder().decode(raw)),source));
      }));
      const judgeKey=await step.do('controle',paidStep,()=>operation(this.env,id,'judge','evaluate',async()=>{
        const source=await checkpoint<SourceText>(this.env,sourceKey), script=await checkpoint<Script>(this.env,scriptKey);
        const raw=await gemini(this.env,JUDGE_PROMPT,{source,script,level:captured.options.level},undefined,()=>active(this.env,id,'evaluate'));
        return encode(validateJudge(JSON.parse(new TextDecoder().decode(raw))));
      }));
      const count=await step.do('nombre-passages',async()=> (await checkpoint<Script>(this.env,scriptKey)).lines.length);
      const audioKeys:string[]=[];
      for (let i=0;i<count;i++) {
        audioKeys.push(await step.do(`voix-${i}`,paidStep,()=>operation(this.env,id,`speech-${i}`,'tts',async()=>{
          const script=await checkpoint<Script>(this.env,scriptKey);
          await active(this.env,id,'tts');
          const audio=await speak(this.env,script.lines[i]!.text);
          mp3Frames(audio); // Valider avant le checkpoint ; aucune réparation payante implicite.
          return audio;
        })));
      }
      await step.do('publication',()=>publish(this.env,id,sourceKey,scriptKey,judgeKey,audioKeys));
      await step.do('notification',()=>flushEvents(this.env));
      return {id,status:'done'};
    } catch {
      await step.do('arret',()=>fail(this.env,id));
      await step.do('notification-arret',()=>flushEvents(this.env));
      throw new Error('Préparation cloud arrêtée ; consulter la file dans Discover.');
    }
  }
}
