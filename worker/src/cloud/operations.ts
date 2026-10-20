import type { Env } from '../env';
import { active } from './store';

/** Journal avant HTTP : une réponse perdue impose un arrêt, jamais un deuxième achat automatique. */
export async function operation(env:Env,id:string,name:string,stage:string,send:()=>Promise<Uint8Array>) {
  await active(env,id,stage);
  const key=`cloud/${id}/${name}`;
  const old=await env.DB.prepare('SELECT state FROM cloud_operations WHERE run_id=? AND operation=?').bind(id,name).first<{state:string}>();
  if (old) {
    if (!await env.FILES.head(key)) throw new Error('Envoi antérieur incertain : nouvel appel interdit.');
    await env.DB.prepare(`UPDATE cloud_operations SET state='complete' WHERE run_id=? AND operation=?`).bind(id,name).run();
    return key;
  }
  // Une seule instance gagne, même si une étape est rejouée après un redémarrage.
  const claim=await env.DB.prepare(`INSERT OR IGNORE INTO cloud_operations(run_id,operation,state,result_key,created_at)
    VALUES (?,?,'sent',?,?)`).bind(id,name,key,new Date().toISOString()).run();
  if (!claim.meta.changes) throw new Error('Étape déjà engagée.');
  let bytes:Uint8Array;
  try { bytes=await send(); }
  catch { throw new Error(`Étape cloud ${name} arrêtée. Aucun nouvel envoi automatique.`); }
  await env.FILES.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'}});
  await env.DB.prepare(`UPDATE cloud_operations SET state='complete' WHERE run_id=? AND operation=?`).bind(id,name).run();
  return key;
}
export async function checkpoint<T>(env:Env,key:string):Promise<T> {
  const object=await env.FILES.get(key);
  if (!object) throw new Error('Résultat intermédiaire indisponible.');
  return object.json<T>();
}
