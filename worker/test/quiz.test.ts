import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import questions from '../../contracts/fixtures/quiz.json';
import type { Manifest } from '../src/publications/types';
import { validQuiz, type QuizQuestion } from '../src/quiz/validation';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

let cookie: string;
beforeEach(async () => { cookie = await login(); });
async function publish(quiz: unknown, contentId = 'quiz-' + crypto.randomUUID()) {
  const variants = [
    { key:'en-source', kind:'source' as const, language:'en', segmentsFile:'segments/source.json' },
    { key:'en-full-b1', kind:'adaptation' as const, language:'en', style:'narration' as const,
      cefrLevel:'B1', derivedFrom:'en-source', segmentsFile:'segments/adapted.json', quiz: quiz as QuizQuestion[] },
  ];
  const files: Manifest['files'] = {}, data: Record<string,string> = {};
  for (const v of variants) {
    const raw = JSON.stringify({ schemaVersion:1,variantKey:v.key,segments:[{
      id:'s001',text:'The city will add buses to reduce traffic next month.',startMs:null,endMs:null,
    }] });
    data[v.segmentsFile] = raw;
    files[v.segmentsFile] = { sha256: await sha256Hex(raw),size:raw.length,contentType:'application/json' };
  }
  const manifest: Manifest = { schemaVersion:1,content:{ id:contentId,title:'Quiz',originalLanguage:'en',sourceType:'youtube',rights:'personal_use' },variants,files };
  const headers = { Authorization:`Bearer ${ATELIER_TOKEN}` };
  const d = await call('/atelier/publications',{ method:'POST',headers,body:{ manifest } });
  expect(d.status,await d.clone().text()).toBe(200);
  const state = await d.json<{ publicationId:string;missing:string[] }>();
  for (const path of state.missing) {
    const f = files[path]!;
    const r = await call(`/atelier/publications/${state.publicationId}/files/${path}`,{ method:'PUT',body:data[path],
      headers:{ ...headers,'x-content-sha256':f.sha256,'Content-Type':f.contentType } });
    expect(r.status,await r.text()).toBe(200);
  }
  const c = await call(`/atelier/publications/${state.publicationId}/commit`,{ method:'POST',headers });
  expect(c.status,await c.text()).toBe(200);
  return { contentId, publicationId:state.publicationId, url:`/api/contents/${contentId}/variants/en-full-b1/quiz` };
}
it('ne divulgue aucune correction avant réponse, puis conserve le score et la première réponse', async () => {
  const p = await publish(questions);
  expect((await call(p.url)).status).toBe(401);
  const get = await call(p.url,{ cookie }), raw = await get.text();
  expect(raw).not.toContain('correctChoice'); expect(raw).not.toContain('explanation');
  expect(JSON.parse(raw)).toMatchObject({ questions:[{ answer:null },{ answer:null },{ answer:null }],score:{ correct:0,answered:0,total:3 } });
  expect(get.headers.get('Cache-Control')).toBe('no-store');
  const detail = await (await call(`/api/contents/${p.contentId}`,{ cookie })).text();
  expect(detail).not.toContain('correctChoice'); expect(detail).not.toContain('explanation');
  const exp = await (await call('/api/export?v=2',{ cookie })).text();
  expect(exp).not.toContain('correctChoice');
  const body = { publicationId:p.publicationId,questionIndex:0,choice:0 };
  for (let i=0;i<2;i++) {
    const r = await call(p.url+'/answers',{ method:'POST',cookie,body });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ answer:{ correct:true,correctChoice:0 },score:{ correct:1,answered:1,total:3 } });
  }
  expect((await call(p.url+'/answers',{ method:'POST',cookie,body:{ ...body,choice:2 } })).status).toBe(409);
  const wrong = await call(p.url+'/answers',{ method:'POST',cookie,body:{ ...body,questionIndex:1,choice:0 } });
  expect(await wrong.json()).toMatchObject({ answer:{ correct:false,correctChoice:1 },score:{ correct:1,answered:2,total:3 } });
  const after = await (await call(p.url,{ cookie })).json<{questions:{answer:unknown}[]}>();
  expect(after.questions[2]!.answer).toBeNull();
  expect(after.questions[0]!.answer).toMatchObject({correctChoice:0});
});
it('rejette les réponses invalides sans enregistrer de score', async () => {
  const p = await publish(questions);
  for (const body of [null,[],{},42,{publicationId:p.publicationId,questionIndex:0,choice:true},
    {publicationId:p.publicationId,questionIndex:3,choice:0},{publicationId:p.publicationId,questionIndex:0,choice:-1}]) {
    expect((await call(p.url+'/answers',{ method:'POST',cookie,body })).status).toBe(400);
  }
  expect((await env.DB.prepare('SELECT 1 FROM quiz_answers WHERE publication_id=?').bind(p.publicationId).first())).toBeNull();
  expect((await call(p.url+'/answers',{ method:'POST',cookie,body:{publicationId:crypto.randomUUID(),questionIndex:0,choice:0} })).status).toBe(404);
  expect((await call(p.url+'/answers',{ method:'POST',cookie,pwa:false,body:{} })).status).toBe(403);
});
const invalidQuizzes = [undefined,[],null,{},questions.slice(0,2),questions.map((q)=>({...q,correctChoice:3})),
  questions.map((q)=>({...q,segmentIndex:1})),questions.map((q)=>({...q,choices:['A','A','C']}))];
for (const [index,quiz] of invalidQuizzes.entries()) {
  it(`publie sans quiz absent ou invalide (cas ${index})`, async () => {
    const p = await publish(quiz);
    expect(await (await call(p.url,{cookie})).json()).toMatchObject({questions:[],score:{total:0}});
    expect((await call(p.url+'/answers',{method:'POST',cookie,body:{publicationId:p.publicationId,questionIndex:0,choice:0}})).status).toBe(404);
  });
}
it('isole les scores par publication et refuse un contenu supprimé ou une ancienne publication expirée', async () => {
  const p = await publish(questions);
  await call(p.url+'/answers',{method:'POST',cookie,body:{publicationId:p.publicationId,questionIndex:0,choice:0}});
  const next = await publish(questions.map((q)=>({...q,explanation:q.explanation+' New.'})),p.contentId);
  expect(await (await call(next.url,{cookie})).json()).toMatchObject({score:{correct:0,answered:0,total:3}});
  expect((await call(p.url+`?publication=${p.publicationId}`,{cookie})).status).toBe(200);
  await env.DB.prepare("UPDATE publications SET superseded_at='2000-01-01' WHERE id=?").bind(p.publicationId).run();
  expect((await call(p.url+`?publication=${p.publicationId}`,{cookie})).status).toBe(404);
  await call(`/api/contents/${p.contentId}`,{method:'DELETE',cookie});
  expect((await call(p.url,{cookie})).status).toBe(404);
  expect(await env.DB.prepare('SELECT 1 FROM quiz_answers WHERE publication_id=?').bind(p.publicationId).first()).toBeNull();
});
it('valide strictement le fixture partagé et les bornes des références', () => {
  expect(validQuiz(questions,1)).toBe(true);
  expect(validQuiz(questions,0)).toBe(false);
  expect(validQuiz(questions.map((q)=>({...q,segmentIndex:0.5})))).toBe(false);
});

it('deux réponses concurrentes ne comptent qu’une fois', async () => {
  const p = await publish(questions);
  const responses = await Promise.all([0,1].map((choice) => call(p.url+'/answers',{
    method:'POST',cookie,body:{publicationId:p.publicationId,questionIndex:0,choice},
  })));
  expect(responses.map((r) => r.status).sort()).toEqual([200,409]);
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM quiz_answers WHERE publication_id=?').bind(p.publicationId).first<{n:number}>();
  expect(row?.n).toBe(1);
});
