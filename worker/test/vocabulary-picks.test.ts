import fixture from '../../contracts/fixtures/vocabulary-pick.json';
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import type { Manifest } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

const base='/api/vocabulary/picks', atelier='/atelier/vocabulary/picks';
const headers={Authorization:`Bearer ${ATELIER_TOKEN}`};
async function setup() {
  const cookie=await login(), id='vocabulary-'+crypto.randomUUID();
  const text='The city will add buses to reduce traffic next month.';
  const raw=JSON.stringify({schemaVersion:1,variantKey:'en-source',segments:[{id:'s001',text,startMs:null,endMs:null}]});
  const file={sha256:await sha256Hex(raw),size:raw.length,contentType:'application/json'};
  const manifest: Manifest={schemaVersion:1,content:{id,title:'Vocabulary',originalLanguage:'en',sourceType:'youtube',rights:'personal_use'},
    variants:[{key:'en-source',kind:'source',language:'en',segmentsFile:'segments/en.json'}],files:{'segments/en.json':file}};
  const declared=await (await call('/atelier/publications',{method:'POST',headers,body:{manifest}})).json<{publicationId:string;missing:string[]}>();
  for (const path of declared.missing) {
    expect((await call(`/atelier/publications/${declared.publicationId}/files/${path}`,{method:'PUT',body:raw,
      headers:{...headers,'Content-Type':file.contentType,'x-content-sha256':file.sha256}})).status).toBe(200);
  }
  expect((await call(`/atelier/publications/${declared.publicationId}/commit`,{method:'POST',headers})).status).toBe(200);
  const body={word:fixture.word,sentence:fixture.sentence,contentId:id,publicationId:declared.publicationId,
    variantKey:'en-source',segmentIndex:0,language:'en'};
  return {cookie,body};
}
it('enregistre un instantané, déduplique et garde la sélection après suppression du contenu',async()=>{
  const {cookie,body}=await setup();
  const first=await call(base,{method:'POST',cookie,body}); expect(first.status).toBe(201);
  const {pick}=await first.json<{pick:{id:string;seq:number}}>();
  const replay=await call(base,{method:'POST',cookie,body:{...body,word:'REDUCE   traffic'}});
  expect(replay.status).toBe(200); expect(await replay.json()).toMatchObject({pick:{id:pick.id,status:'pending'}});
  await call(`/api/contents/${body.contentId}`,{method:'DELETE',cookie});
  expect(await (await call(base,{cookie})).json()).toMatchObject({picks:expect.arrayContaining([expect.objectContaining({id:pick.id,sentence:body.sentence})])});
  expect((await call(base+'/'+pick.id,{method:'DELETE',cookie})).status).toBe(204);
  expect(await env.DB.prepare('SELECT 1 FROM vocabulary_picks WHERE id=?').bind(pick.id).first()).toBeNull();
});
it('protège les routes et valide le passage, la version, les bornes et la langue',async()=>{
  const {cookie,body}=await setup();
  expect((await call(base)).status).toBe(401);
  expect((await call(atelier)).status).toBe(401);
  expect((await call(base,{method:'POST',cookie,pwa:false,body})).status).toBe(403);
  for (const value of [null,[],{}, {...body,language:'fr'},{...body,segmentIndex:1},{...body,word:'absent'},
    {...body,sentence:'Invented reduce traffic.'},{...body,segmentIndex:true},{...body,word:'x'.repeat(121)}]) {
    expect((await call(base,{method:'POST',cookie,body:value})).status).toBe(400);
  }
  expect((await call(base,{method:'POST',cookie,body:{...body,publicationId:crypto.randomUUID()}})).status).toBe(404);
  expect((await call(base+'?limit=-1',{cookie})).status).toBe(400);
});
it('reprend un échec, protège le succès et pagine sans perdre les sélections',async()=>{
  const {cookie,body}=await setup();
  const ids:string[]=[];
  for (const word of ['city','buses','traffic']) {
    const r=await (await call(base,{method:'POST',cookie,body:{...body,word}})).json<{pick:{id:string}}>(); ids.push(r.pick.id);
  }
  const page=await (await call(atelier+'?limit=1',{headers})).json<{picks:{id:string}[];nextAfter:number}>();
  expect(page.picks).toHaveLength(1); expect(page.nextAfter).toBeTypeOf('number');
  const next=await (await call(atelier+'?limit=1&after='+page.nextAfter,{headers})).json<{picks:{id:string}[]}>();
  expect(next.picks[0]!.id).not.toBe(page.picks[0]!.id);
  const result=atelier+'/'+ids[0]+'/result';
  expect((await call(result,{method:'POST',headers,body:{status:'sent'}})).status).toBe(400);
  await call(result,{method:'POST',headers,body:{status:'failed',error:'secret'}});
  expect(await (await call(result,{method:'POST',headers,body:{status:'already_known',wordId:'known'}})).json()).toMatchObject({pick:{status:'already_known',wordId:'known',error:null}});
  expect(await (await call(result,{method:'POST',headers,body:{status:'failed'}})).json()).toMatchObject({pick:{status:'already_known'}});
});
