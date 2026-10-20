import { env } from 'cloudflare:workers';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { assertNoTechnicalIds, cleanCitations } from '../src/cloud/citations';
import { validateScript } from '../src/cloud/editorial';
import { prepareSpokenScript } from '../src/cloud/scripts';
import { speak } from '../src/cloud/speech';
import { publish } from '../src/cloud/publish';
import { cloudEnv, script, setupCloud, startNote } from './cloud-fixtures';

beforeEach(setupCloud);
afterEach(()=>vi.unstubAllGlobals());
const numbers=Array.from({length:24},(_,i)=>70+i).filter(i=>i!==85);
const quoted=numbers.map(i=>`s${String(i).padStart(4,'0')}`);
const refs=numbers.map(i=>`s${i}`);
const citation=`(${quoted.join(', ')})`;
const source={language:'fr',paragraphs:Array.from({length:93},()=> 'Une information de la source.')};
it('retire la liste exacte signalée en anglais et en français, en conservant les métadonnées',()=>{
  const dirty={lines:script.lines.map(line=>({...line,text:`${line.text} ${citation}`,fr:`Une explication ${citation}.`,sourceSegments:refs.slice(0,20)}))};
  const original=structuredClone(dirty), clean=validateScript(dirty,source);
  expect(clean.lines[0]!.text).toBe(script.lines[0]!.text);
  expect(clean.lines[0]!.fr).toBe('Une explication.');
  expect(clean.lines[0]!.sourceSegments).toEqual(refs.slice(0,20));
  expect(dirty).toEqual(original);
  expect(validateScript(clean,source)).toEqual(clean);
});
it('accepte les crochets, références isolées, séparateurs et retours à la ligne',()=>{
  expect(cleanCitations('First [s1; s2]. Next (s1).',new Set(['s1','s2']))).toBe('First. Next.');
  expect(cleanCitations('First (s1\ns2).',new Set(['s1','s2']))).toBe('First.');
  expect(cleanCitations('First [d1-s0070; d2-s0071].',new Set(['d1-s0070','d2-s0071']))).toBe('First.');
});
it('préserve les parenthèses de faits, les chiffres et les références ambiguës',()=>{
  const facts='Growth (2026, 2027), (about 3%), (s0070 is a code), [s9999].';
  expect(cleanCitations(facts,new Set(['s70']))).toBe(facts);
  expect(cleanCitations('Text (s0070, s9999).',new Set(['s70']))).toBe('Text (s0070, s9999).');
  expect(()=>assertNoTechnicalIds('Growth (2026, 2027), about 3%; S&P 500.')).not.toThrow();
});
it.each(['Text s70.','Text [s9999].','Text (s70, s9999).','Text (s0070 is a code).','Text d1-s0070.'])('bloque un renvoi restant sans modifier arbitrairement son sens : %s',text=>{
  expect(()=>assertNoTechnicalIds(text)).toThrow('Identifiant de passage');
});
it('refuse un passage uniquement constitué de références ou une traduction encore contaminée',()=>{
  expect(()=>validateScript({lines:[{...script.lines[0],text:'(s1)'},script.lines[1]]},source)).toThrow('renvois source');
  expect(()=>validateScript({lines:script.lines.map(l=>({...l,fr:'Un fait [s9999].'}))},source)).toThrow('Identifiant de passage');
});
it('nettoie un ancien checkpoint sans toucher à l’original ni faire un appel fournisseur',async()=>{
  const http=vi.fn(()=>{throw new Error('Réseau interdit');});vi.stubGlobal('fetch',http);
  const dirty={lines:script.lines.map(l=>({...l,text:`${l.text} (s0001)`,fr:`${l.fr} [s0001]`}))};
  await env.FILES.put('old-source',JSON.stringify(source));await env.FILES.put('old-script',JSON.stringify(dirty));
  const key=await prepareSpokenScript(cloudEnv,'test','old-source','old-script');
  expect(await (await env.FILES.get(key))!.json()).toEqual(script);
  expect(await (await env.FILES.get('old-script'))!.json()).toEqual(dirty);
  expect(http).not.toHaveBeenCalled();
});
it('la barrière Deepgram refuse les identifiants avant tout appel HTTP',async()=>{
  const http=vi.fn();vi.stubGlobal('fetch',http);
  await expect(speak(cloudEnv,`A fact. ${citation}`)).rejects.toThrow('Identifiant de passage');
  expect(http).not.toHaveBeenCalled();
});
it('ne réutilise pas un ancien audio associé à un texte contaminé et ne le régénère pas',async()=>{
  const {id}=await startNote(), http=vi.fn();vi.stubGlobal('fetch',http);
  await env.FILES.put('legacy-source',JSON.stringify(source));
  await env.FILES.put('legacy-script',JSON.stringify({lines:script.lines.map(l=>({...l,text:`${l.text} (s1)`}))}));
  await env.DB.prepare("INSERT INTO cloud_operations(run_id,operation,state,result_key,created_at) VALUES (?,'speech-0','complete','old-audio','2026-01-01')").bind(id).run();
  await expect(prepareSpokenScript(cloudEnv,id,'legacy-source','legacy-script')).rejects.toThrow('audio a déjà été engagé');
  expect(http).not.toHaveBeenCalled();
  expect(await env.FILES.head(`cloud/${id}/script-spoken-v2`)).toBeNull();
});
it('la publication refuse un checkpoint contaminé au lieu de nettoyer après la génération audio',async()=>{
  const {id}=await startNote();
  await env.FILES.put('source',JSON.stringify(source));
  await env.FILES.put('dirty',JSON.stringify({lines:script.lines.map(l=>({...l,text:`${l.text} (s1)`}))}));
  await env.FILES.put('judge',JSON.stringify({verdict:'ok',reasons:[]}));
  await expect(publish(cloudEnv,id,'source','dirty','judge',[])).rejects.toThrow('Identifiant de passage');
  expect((await env.DB.prepare('SELECT COUNT(*) n FROM publications').first<{n:number}>())!.n).toBe(0);
});
