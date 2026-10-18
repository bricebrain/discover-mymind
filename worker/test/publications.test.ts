import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { cleanupPublications } from '../src/publications/cleanup';
import { canonicalJson } from '../src/publications/validation';
import type { Manifest, Segments } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

const workerEnv = env as Env;
const bearer = { Authorization: `Bearer ${ATELIER_TOKEN}` };
let cookie = '';
let counter = 0;
interface Bundle { m: Manifest; data: Record<string,string> }
async function bundle(type: 'youtube' | 'podcast' | 'reflection' = 'youtube',language = 'en'): Promise<Bundle> {
  const id = `publication-test-${++counter}`;
  const doc: Segments = { schemaVersion: 1,variantKey: `${language}-source`,segments: [{ id:'s001',text:`A source sentence for ${id}.`,startMs:null,endMs:null }] };
  const raw = canonicalJson(doc), path = `segments/${language}-source.json`;
  const m: Manifest = { schemaVersion:1,content:{ id,title:id,originalLanguage:language,sourceType:type,rights:'personal_use' },
    variants:[{ key:doc.variantKey,kind:'source',language,segmentsFile:path }],
    files:{ [path]:{ sha256:await sha256Hex(raw),size:raw.length,contentType:'application/json' } },removeVariants:[] };
  if (type === 'podcast') {
    const episodeId = counter.toString(16).padStart(20,'0');
    const show = await env.DB.prepare('SELECT id FROM shows LIMIT 1').first<{ id: string }>();
    await env.DB.prepare('INSERT INTO episodes (id,show_id,guid,title,audio_url,created_at) VALUES (?,?,?,?,?,?)')
      .bind(episodeId,show!.id,id,id,'https://publisher.example.com/audio.mp3',new Date().toISOString()).run();
    m.content.sourceRef = `episode:${episodeId}`;
    m.variants[0]!.audio = { source:'publisher_stream',url:'https://publisher.example.com/audio.mp3',origin:'original',durationMs:2000,timingSource:'none' };
  }
  if (type === 'reflection') {
    const note = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO reflections (id,body_md,created_at,updated_at) VALUES (?,?,?,?)').bind(note,'Une idée',new Date().toISOString(),new Date().toISOString()).run();
    m.content.sourceRef = `reflection:${note}`;
  }
  return { m,data:{ [path]:raw } };
}
async function declare(b: Bundle) {
  return call('/atelier/publications',{ method:'POST',headers:bearer,body:{ manifest:b.m } });
}
async function uploadAll(id: string,b: Bundle,missing?: string[]) {
  for (const path of missing ?? Object.keys(b.data)) {
    const f = b.m.files[path]!;
    const r = await call(`/atelier/publications/${id}/files/${path}`, { method:'PUT',body:b.data[path],headers:{ ...bearer,'Content-Type':f.contentType,'Content-Length':String(f.size),'x-content-sha256':f.sha256 } });
    expect(r.status,await r.text()).toBe(200);
  }
}
const commit = (id: string) => call(`/atelier/publications/${id}/commit`,{ method:'POST',headers:bearer });
async function publish(b: Bundle) {
  const res = await declare(b); expect(res.status,await res.clone().text()).toBe(200);
  const s = await res.json<{ publicationId:string;missing:string[] }>();
  await uploadAll(s.publicationId,b,s.missing);
  const r = await commit(s.publicationId); expect(r.status,await r.text()).toBe(200);
  return s.publicationId;
}

beforeEach(async () => { cookie = await login(); });

describe('Publication complète', () => {
  it('refuse les enveloppes non objet', async () => {
    for (const body of [null,[],42]) {
      const r=await call('/atelier/publications',{ method:'POST',headers:bearer,body });
      expect(r.status).toBe(422);
    }
  });
  for (const [type,language] of [['youtube','en'],['podcast','fr'],['podcast','en'],['reflection','fr']] as const) {
    it(`publie ${type} ${language}, visible avec ses médias`, async () => {
      const b = await bundle(type,language), id = await publish(b);
      const detail = await call(`/api/contents/${b.m.content.id}`,{ cookie });
      expect(detail.status).toBe(200);
      const d = await detail.json<{ publicationId:string;variants:{ segmentsUrl:string }[] }>();
      expect(d.publicationId).toBe(id);
      expect((await call(d.variants[0]!.segmentsUrl,{ cookie })).status).toBe(200);
      const library = await call('/api/library',{ cookie });
      expect((await library.json<{ contents:{ id:string }[] }>()).contents.some((c) => c.id===b.m.content.id)).toBe(true);
    });
  }
  it('ne rend jamais une publication incomplète visible et permet sa reprise', async () => {
    const b = await bundle();
    const a = await (await declare(b)).json<{ publicationId:string;missing:string[] }>();
    expect((await call(`/api/contents/${b.m.content.id}`,{ cookie })).status).toBe(404);
    expect((await commit(a.publicationId)).status).toBe(409);
    await uploadAll(a.publicationId,b);
    const retry = await (await declare(b)).json<typeof a>();
    expect(retry.publicationId).toBe(a.publicationId); expect(retry.missing).toEqual([]);
    expect((await commit(a.publicationId)).status).toBe(200);
    const ready = await (await declare(b)).json<{ publicationId:string;status:string }>();
    expect(ready).toMatchObject({ publicationId:a.publicationId,status:'ready' });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM publications WHERE content_id=?').bind(b.m.content.id).first<{ n:number }>())?.n).toBe(1);
  });
  it('déclarations simultanées : une seule révision', async () => {
    const b = await bundle();
    const responses = await Promise.all([declare(b),declare(b)]);
    const states = await Promise.all(responses.map((r) => r.json<{ publicationId:string }>()));
    expect(states[0]!.publicationId).toBe(states[1]!.publicationId);
  });
  it('un seul des deux commits simultanés réussit', async () => {
    const b = await bundle(), d = await (await declare(b)).json<{ publicationId:string }>();
    await uploadAll(d.publicationId,b);
    const rs = await Promise.all([commit(d.publicationId),commit(d.publicationId)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200,409]);
  });
  it('une ancienne révision ne remplace jamais la courante', async () => {
    const older = await bundle();
    const a = await (await declare(older)).json<{ publicationId:string }>();
    const newer = structuredClone(older); newer.m.content.title='Version suivante';
    const bid = await publish(newer);
    await uploadAll(a.publicationId,older);
    expect((await (await commit(a.publicationId)).json<{ status:string }>()).status).toBe('superseded');
    const detail = await (await call(`/api/contents/${older.m.content.id}`,{ cookie })).json<{ publicationId:string;content:{ title:string } }>();
    expect(detail.publicationId).toBe(bid); expect(detail.content.title).toBe('Version suivante');
  });
  it('refuse une variante omise, sauf retrait explicite', async () => {
    const b = await bundle();
    b.m.variants.push({ ...b.m.variants[0]!,key:'fr-faithful',kind:'faithful_translation',language:'fr',derivedFrom:'en-source',segmentsFile:'segments/fr-faithful.json' });
    const doc = canonicalJson({ schemaVersion:1,variantKey:'fr-faithful',segments:[{ id:'s001',text:'Une phrase.',startMs:null,endMs:null }] });
    b.data['segments/fr-faithful.json']=doc;
    b.m.files['segments/fr-faithful.json']={ sha256:await sha256Hex(doc),size:doc.length,contentType:'application/json' };
    await publish(b);
    b.m.variants.pop(); delete b.m.files['segments/fr-faithful.json'];delete b.data['segments/fr-faithful.json'];
    const refused = await declare(b); expect(refused.status).toBe(422);expect(await refused.json()).toMatchObject({ error:{ code:'variant_dropped' } });
    b.m.removeVariants=['fr-faithful']; await publish(b);
  });
  it('vérifie l’enclosure officielle en base', async () => {
    const b = await bundle('podcast'); b.m.variants[0]!.audio!.url='https://another.example.com/audio.mp3';
    expect(await (await declare(b)).json()).toMatchObject({ error:{ code:'stream_mismatch' } });
  });
  it('refuse un bail expiré dès la déclaration', async () => {
    const b = await bundle();
    const r = await call('/atelier/publications',{ method:'POST',headers:bearer,body:{ manifest:b.m,queueItemId:'absent',leaseToken:'expired' } });
    expect(r.status).toBe(409);expect(await r.json()).toMatchObject({ error:{ code:'lease_lost' } });
  });
});

describe('Fichiers et nettoyage', () => {
  it('refuse corruption, chemin inconnu et mauvais type ; la relance ne réclame que le manquant', async () => {
    const b = await bundle(), s = await (await declare(b)).json<{ publicationId:string }>();
    const path = Object.keys(b.data)[0]!, f = b.m.files[path]!;
    const opts = { method:'PUT',body:'x'.repeat(f.size),headers:{ ...bearer,'Content-Type':f.contentType,'Content-Length':String(f.size),'x-content-sha256':f.sha256 } };
    const short = await call(`/atelier/publications/${s.publicationId}/files/${path}`,{ ...opts,body:'interrupted' });
    expect(short.status).toBe(422);
    const bad = await call(`/atelier/publications/${s.publicationId}/files/${path}`,opts);
    expect(bad.status).toBe(422);expect(await env.FILES.head(`blobs/${f.sha256}`)).toBeNull();
    expect((await call(`/atelier/publications/${s.publicationId}/files/unknown`,opts)).status).toBe(404);
    expect((await (await declare(b)).json<{ missing:string[] }>()).missing).toEqual([path]);
    await uploadAll(s.publicationId,b);
    expect((await (await declare(b)).json<{ missing:string[] }>()).missing).toEqual([]);
  });
  it('sert les plages audio et protège les médias par session', async () => {
    const b = await bundle(), raw='ID3-audio-test';
    b.data['audio/source.mp3']=raw;
    b.m.files['audio/source.mp3']={ sha256:await sha256Hex(raw),size:raw.length,contentType:'audio/mpeg' };
    b.m.variants[0]!.audio={ source:'r2',file:'audio/source.mp3',origin:'original',durationMs:2000,timingSource:'none' };
    await publish(b);
    const url=`/api/contents/${b.m.content.id}/variants/en-source/audio`;
    expect((await call(url)).status).toBe(401);
    const r = await call(url,{ cookie,headers:{ Range:'bytes=0-2' } });
    expect(r.status).toBe(206);expect(r.headers.get('Content-Range')).toBe(`bytes 0-2/${raw.length}`);expect(await r.text()).toBe('ID3');
    expect((await call(url,{ cookie,headers:{ Range:'bytes=9999-' } })).status).toBe(416);
  });
  it('refuse les segments mal formés au commit', async () => {
    const b = await bundle(), path=Object.keys(b.data)[0]!;b.data[path]='{}';
    b.m.files[path]={ ...b.m.files[path]!,sha256:await sha256Hex('{}'),size:2 };
    const s=await (await declare(b)).json<{ publicationId:string }>();await uploadAll(s.publicationId,b);
    const r=await commit(s.publicationId);expect(r.status).toBe(422);expect(await r.json()).toMatchObject({ error:{ code:'invalid_segments' } });
  });
  it('protège les références actives, la grâce de 7 jours, puis supprime les blobs abandonnés', async () => {
    const b=await bundle(), old=await publish(b);
    const next=structuredClone(b);next.m.content.title='Autre titre';const latest=await publish(next);
    const key=`blobs/${Object.values(b.m.files)[0]!.sha256}`;
    await cleanupPublications(workerEnv);expect(await env.FILES.head(key)).not.toBeNull();
    await env.DB.prepare("UPDATE publications SET status='abandoned' WHERE id=?").bind(latest).run();
    await cleanupPublications(workerEnv);expect(await env.FILES.head(key)).not.toBeNull();
    await env.DB.prepare("UPDATE publications SET superseded_at=? WHERE id=?").bind(new Date(Date.now()-8*86400_000).toISOString(),old).run();
    await cleanupPublications(workerEnv);expect(await env.FILES.head(key)).toBeNull();
  });
  it('abandonne les envois inactifs et récupère un verrou de commit interrompu', async () => {
    const b=await bundle(), s=await (await declare(b)).json<{ publicationId:string }>();
    await env.DB.prepare("UPDATE publications SET status='committing',commit_token='lost',updated_at=? WHERE id=?")
      .bind(new Date(Date.now()-16*60_000).toISOString(),s.publicationId).run();
    await cleanupPublications(workerEnv);
    expect((await env.DB.prepare('SELECT status FROM publications WHERE id=?').bind(s.publicationId).first<{ status:string }>())?.status).toBe('uploading');
    await env.DB.prepare('UPDATE publications SET updated_at=? WHERE id=?').bind(new Date(Date.now()-49*3600_000).toISOString(),s.publicationId).run();
    await cleanupPublications(workerEnv);
    expect((await env.DB.prepare('SELECT status,manifest_r2_key FROM publications WHERE id=?').bind(s.publicationId).first())).toMatchObject({ status:'abandoned',manifest_r2_key:'' });
  });
  it('la réservation du nettoyage empêche une référence concurrente', async () => {
    const b=await bundle(), key=`blobs/${Object.values(b.m.files)[0]!.sha256}`;
    await env.DB.prepare('INSERT INTO publication_gc (r2_key) VALUES (?)').bind(key).run();
    const r=await declare(b);expect(r.status).toBe(409);expect(await r.json()).toMatchObject({ error:{ code:'blob_deleting' } });
    await env.DB.prepare('DELETE FROM publication_gc WHERE r2_key=?').bind(key).run();
  });
});

describe('Suppression', () => {
  it('supprime un contenu : invisible, épisode détaché, blobs libérés, republication possible', async () => {
    const b = await bundle('podcast','en'); await publish(b);
    const id = b.m.content.id, episode = b.m.content.sourceRef!.slice(8);
    await env.DB.prepare("INSERT INTO listening_progress (target_type,target_id,audio_ref,position_ms,duration_ms,completed,updated_at) VALUES ('variant',?,?,1000,2000,0,?)")
      .bind(`${id}:en-source`,'x',new Date().toISOString()).run();
    const r = await call(`/api/contents/${id}`,{ method:'DELETE',cookie });
    expect(r.status,await r.text()).toBe(204);
    expect((await call(`/api/contents/${id}`,{ cookie })).status).toBe(404);
    const library = await (await call('/api/library',{ cookie })).json<{ contents:{ id:string }[] }>();
    expect(library.contents.some((c) => c.id===id)).toBe(false);
    expect((await env.DB.prepare('SELECT content_id FROM episodes WHERE id=?').bind(episode).first<{ content_id:string|null }>())?.content_id).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM listening_progress WHERE target_id=?").bind(`${id}:en-source`).first()).toBeNull();
    const key = `blobs/${Object.values(b.m.files)[0]!.sha256}`;
    await cleanupPublications(workerEnv); expect(await env.FILES.head(key)).toBeNull();
    expect((await call(`/api/contents/${id}`,{ method:'DELETE',cookie })).status).toBe(404);
    // Une nouvelle préparation identique se republie et redevient visible.
    await publish(b);
    expect((await call(`/api/contents/${id}`,{ cookie })).status).toBe(200);
    expect((await env.DB.prepare('SELECT content_id FROM episodes WHERE id=?').bind(episode).first<{ content_id:string|null }>())?.content_id).toBe(id);
  });
  it('l’Atelier peut supprimer un contenu avec son jeton, pas sans', async () => {
    const b = await bundle(); await publish(b);
    expect((await call(`/atelier/contents/${b.m.content.id}`,{ method:'DELETE',pwa:false })).status).toBe(401);
    expect((await call(`/atelier/contents/${b.m.content.id}`,{ method:'DELETE',headers:bearer,pwa:false })).status).toBe(204);
    expect((await call(`/api/contents/${b.m.content.id}`,{ cookie })).status).toBe(404);
  });
  it('retire de l’historique une demande terminée, jamais une demande active', async () => {
    const now = new Date().toISOString(), done = crypto.randomUUID(), active = crypto.randomUUID();
    for (const [id,status,ref] of [[done,'failed','aaaaaaaaaaaaaaaaaaaa'],[active,'pending','bbbbbbbbbbbbbbbbbbbb']]) {
      await env.DB.prepare("INSERT INTO prepare_queue (id,kind,ref,options_json,status,created_at,updated_at) VALUES (?,'episode',?,'{}',?,?,?)").bind(id,ref,status,now,now).run();
    }
    expect((await call(`/api/queue/${active}/remove`,{ method:'POST',cookie,body:{} })).status).toBe(409);
    expect((await call(`/api/queue/${done}/remove`,{ method:'POST',cookie,body:{} })).status).toBe(204);
    expect(await env.DB.prepare('SELECT 1 FROM prepare_queue WHERE id=?').bind(done).first()).toBeNull();
    expect((await call(`/atelier/queue/${active}/remove`,{ method:'POST',headers:bearer,pwa:false,body:{} })).status).toBe(409);
  });
});

it('rattache une vidéo suivie à sa publication YouTube et la détache à la suppression', async () => {
  const videoId = 'ZvSfmW9F6tE', episodeId = 'd'.repeat(20);
  await env.DB.prepare(`INSERT OR IGNORE INTO shows (id,title,feed_url,language,category,source_type,channel_id,next_check_at,created_at)
    VALUES ('youtube-publication','Chaîne test','https://www.youtube.com/feeds/videos.xml?channel_id=UCwI-JbGNsojunnHbFAc0M4Q',
      'fr','science','youtube','UCwI-JbGNsojunnHbFAc0M4Q','2026-10-18','2026-10-18')`).run();
  await env.DB.prepare(`INSERT INTO episodes (id,show_id,guid,title,audio_url,video_id,created_at)
    VALUES (?,'youtube-publication',?,'Vidéo test',?,?,'2026-10-18')`)
    .bind(episodeId, `yt:video:${videoId}`, `https://www.youtube.com/watch?v=${videoId}`, videoId).run();
  const b = await bundle('youtube');
  b.m.content.sourceRef = `youtube:${videoId}`;
  await publish(b);
  const detail = await (await call(`/api/episodes/${episodeId}`, { cookie })).json<{ episode: { contentId: string } }>();
  expect(detail.episode.contentId).toBe(b.m.content.id);
  expect((await call(`/api/contents/${b.m.content.id}`, { method: 'DELETE', cookie })).status).toBe(204);
  expect(await env.DB.prepare('SELECT content_id FROM episodes WHERE id=?').bind(episodeId).first()).toMatchObject({ content_id: null });
});
