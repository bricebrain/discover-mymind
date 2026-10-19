import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { ATELIER_TOKEN, call, login } from './helpers';
const headers={Authorization:`Bearer ${ATELIER_TOKEN}`};
const a='a'.repeat(20), e='b'.repeat(20), n='12345678-1234-4234-8234-123456789abc';
const post=(body:unknown)=>call('/atelier/related',{method:'POST',headers,pwa:false,body});
beforeEach(async()=>{
 await env.DB.batch([
  env.DB.prepare('DELETE FROM related_links'),env.DB.prepare('DELETE FROM related_members'),env.DB.prepare('DELETE FROM related_groups'),
  env.DB.prepare("INSERT OR REPLACE INTO articles(id,source_id,guid,url,title,created_at) VALUES (?,'guardian-world','related','https://example.com','Article Paris','2026-10-19')").bind(a),
  env.DB.prepare("INSERT OR REPLACE INTO episodes(id,show_id,guid,title,audio_url,created_at) SELECT ?,id,'related','Episode Paris','https://example.com/a.mp3','2026-10-19' FROM shows LIMIT 1").bind(e),
  env.DB.prepare("INSERT OR REPLACE INTO reflections(id,title,body_md,created_at,updated_at) VALUES (?,'Note Paris','Texte','2026-10-19','2026-10-19')").bind(n),
 ]);
});
const payload=()=>({sources:[{type:'article',id:a,neighbors:[{targetType:'episode',targetId:e,score:.8},{targetType:'reflection',targetId:n,score:.7},{targetType:'article',targetId:'missing',score:.6}]}],groups:[{groupId:'event-1',title:'Paris',dossierCandidate:true,members:[{type:'article',id:a},{type:'episode',id:e},{type:'reflection',id:n}]}]});
it('authentifie et borne les lots',async()=>{
 expect((await call('/atelier/related/items',{pwa:false})).status).toBe(401);
 expect((await call('/api/related?type=article&id='+a)).status).toBe(401);
 expect((await call('/atelier/related/items?after=bad',{headers})).status).toBe(400);
 expect((await call('/atelier/related/items?limit=201',{headers})).status).toBe(400);
 expect((await post({sources:Array.from({length:40},(_,i)=>({type:'article',id:'s'+i,neighbors:Array.from({length:5},(_,j)=>({targetType:'episode',targetId:'t'+j,score:.6}))})),groups:[]})).status).toBe(200);
 expect((await post({sources:[{type:'article',id:a,neighbors:[null]}],groups:[]})).status).toBe(400);
 expect((await post({sources:Array(41).fill(payload().sources[0]),groups:[]})).status).toBe(400);
 expect((await post({sources:[{type:'article',id:a,neighbors:Array(6).fill({targetType:'episode',targetId:e,score:.8})}],groups:[]})).status).toBe(400);
 expect((await post({sources:[],groups:[{...payload().groups[0],members:Array(201).fill({type:'episode',id:e})}]})).status).toBe(400);
});
it('publie idempotemment et sert voisins et groupes',async()=>{
 const cookie=await login();
 expect((await post(payload())).status).toBe(200);
 const first=await env.DB.prepare('SELECT updated_at FROM related_groups').first();
 expect((await post(payload())).status).toBe(200);
 expect(await env.DB.prepare('SELECT updated_at FROM related_groups').first()).toEqual(first);
 const data=await (await call('/api/related?type=article&id='+a,{cookie})).json<{neighbors:unknown[];groups:unknown[]}>();
 expect(data.neighbors).toHaveLength(2);expect(data.groups).toHaveLength(1);
 const groups=await (await call('/api/related/groups?since=2026-01-01',{cookie})).json<{groups:unknown[]}>();
 expect(groups.groups).toHaveLength(1);
 expect((await call('/api/related/groups?since=nope',{cookie})).status).toBe(400);
});
it('pagine les changements, exclut la corbeille et supprime en cascade',async()=>{
 let after=0, found=false;
 for(let i=0;i<100;i++){
  const p=await (await call('/atelier/related/items?limit=2&after='+after,{headers})).json<{items:{id:string}[];nextCursor:number;hasMore:boolean}>();
  found ||= p.items.some(x=>x.id===n);after=p.nextCursor;if(!p.hasMore)break;
 }
 expect(found).toBe(true);
 await post(payload());
 await env.DB.prepare("UPDATE reflections SET deleted_at='2026-10-19' WHERE id=?").bind(n).run();
 const page=await (await call('/atelier/related/items?after='+after,{headers})).json<{items:{id:string;deleted:number}[]}>();
 expect(page.items.find(x=>x.id===n)?.deleted).toBe(1);
 const cookie=await login();
 expect(await (await call('/api/related?type=reflection&id='+n,{cookie})).json()).toEqual({neighbors:[],groups:[]});
 await env.DB.prepare('DELETE FROM episodes WHERE id=?').bind(e).run();
 expect(await env.DB.prepare('SELECT count(*) AS n FROM related_links').first()).toEqual({n:0});
 await env.DB.prepare('DELETE FROM articles WHERE id=?').bind(a).run();
 expect(await env.DB.prepare('SELECT count(*) AS n FROM related_members').first()).toEqual({n:0});
});
