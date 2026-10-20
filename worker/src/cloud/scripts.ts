import type { Env } from '../env';
import { validateScript } from './editorial';
import { checkpoint } from './operations';
import type { SourceText } from './types';
import type { Script } from './types';

/** Même texte nettoyé pour le juge, la voix et l'affichage, y compris à partir d'un ancien checkpoint. */
export async function prepareSpokenScript(env:Env,id:string,sourceKey:string,scriptKey:string):Promise<string> {
  const source=await checkpoint<SourceText>(env,sourceKey);
  const original=await checkpoint<Script>(env,scriptKey), script=validateScript(original,source);
  const changed=script.lines.some((line,i)=>line.text!==original.lines[i]!.text || line.fr!==original.lines[i]!.fr);
  if (changed && await env.DB.prepare("SELECT operation FROM cloud_operations WHERE run_id=? AND operation GLOB 'speech-*' LIMIT 1").bind(id).first()) {
    throw new Error('Un audio a déjà été engagé avec un texte différent. Réutilisation et régénération automatiques interdites.');
  }
  const key=`cloud/${id}/script-spoken-v2`;
  await env.FILES.put(key,JSON.stringify(script),{httpMetadata:{contentType:'application/json'}});
  return key;
}
