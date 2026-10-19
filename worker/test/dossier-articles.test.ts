import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { ATELIER_TOKEN, call, login } from './helpers';
import type { Snapshot } from '../src/dossiers/sources';

const article = 'a'.repeat(20), ep = 'e'.repeat(20);
const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const options = { coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 10 };
const refs = [{ type: 'article', id: article }, { type: 'episode', id: ep }];
let cookie = '';

beforeEach(async () => {
  cookie = await login();
  await env.DB.prepare('DELETE FROM prepare_queue').run();
  await env.DB.prepare('DELETE FROM articles WHERE id=?').bind(article).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO episodes(id,show_id,guid,title,audio_url,created_at)
    SELECT ?,id,'d2-episode','Épisode D2','https://example.com/audio.mp3','2026-10-19' FROM shows LIMIT 1`).bind(ep).run();
  await env.DB.prepare(`INSERT INTO articles(id,source_id,guid,url,title,published_at,content_text,content_status,created_at)
    VALUES (?,'guardian-world','d2','https://www.theguardian.com/test','Article D2','2026-10-18',?,'complete','2026-10-19')`)
    .bind(article,'The full article contains reliable information.\n\nA second paragraph gives more context.').run();
});
const create = (sources = refs, title?: string) => call('/api/dossiers', { method: 'POST', cookie, body: { sources, ...(title === undefined ? {} : { title }) } });
async function dossier() {
  const res = await create();
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json<{dossier:{id:string;title:string}}>()).dossier;
}
const prepare = (id: string) => call(`/api/dossiers/${id}/prepare`, { method: 'POST', cookie, body: options });
const lease = () => call('/atelier/queue/lease', { method: 'POST', headers, body: { owner: 'mac-d2' } });
const complete = (status = 'complete', text = 'Full retrieved article.\n\nSecond paragraph.') => call(`/atelier/article-texts/${article}`, { method: 'POST', headers, body: { status, text } });

it('crée en un appel, avec titre par défaut, valide le nombre et les doublons', async () => {
  expect((await dossier()).title).toBe('Nouveau dossier');
  expect((await create(refs, ' Mon dossier ')).status).toBe(201);
  expect((await create(refs, '')).status).toBe(422);
  expect((await create(refs.slice(0,1))).status).toBe(422);
  expect((await create([...refs,...refs,...refs,...refs])).status).toBe(422);
  expect((await create([refs[0]!,refs[0]!])).status).toBe(422);
  expect((await create([{ type: 'article', id: 'missing' },refs[1]!])).status).toBe(422);
});

it('propose l’article plutôt que sa note et refuse la paire article/note', async () => {
  const note = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO reflections(id,title,body_md,created_at,updated_at)
    VALUES (?,'Article D2','Une note liée assez longue pour le dossier.','2026-10-19','2026-10-19')`).bind(note).run();
  await env.DB.prepare('UPDATE articles SET reflection_id=? WHERE id=?').bind(note,article).run();
  const list = await (await call('/api/dossier-sources?q=Article%20D2', { cookie })).json<{sources:{id:string;type:string;label:string}[]}>();
  expect(list.sources).toContainEqual(expect.objectContaining({ id: article, type: 'article', label: 'Article · The Guardian' }));
  expect(list.sources.some(s => s.id === note)).toBe(false);
  expect((await create([refs[0]!,{ type: 'reflection', id: note }])).status).toBe(422);
  // Les dossiers historiques continuent à accepter la note.
  expect((await create([{ type: 'reflection', id: note },refs[1]!])).status).toBe(201);
});

it('fige texte, journal, langue, URL et date ; une suppression ultérieure ne change pas l’exécution', async () => {
  const d = await dossier();
  expect((await prepare(d.id)).status).toBe(201);
  await env.DB.prepare("UPDATE articles SET content_text='Changed',title='Changed' WHERE id=?").bind(article).run();
  const leased = await (await lease()).json<{item:{source:{sources:Snapshot[]}}}>();
  expect(leased.item.source.sources[0]).toMatchObject({ type: 'article', kind: 'article', ref: article,
    title: 'Article D2', sourceName: 'The Guardian', language: 'en', sourceUrl: 'https://www.theguardian.com/test',
    publishedAt: '2026-10-18', contentStatus: 'complete' });
  expect(leased.item.source.sources[0]!.text).toContain('full article');
  await env.DB.prepare('DELETE FROM articles WHERE id=?').bind(article).run();
  const detail = await (await call(`/api/dossiers/${d.id}`, { cookie })).json<{dossier:{sources:{title:string|null}[]}}>();
  expect(detail.dossier.sources[0]!.title).toBeNull();
});

for (const status of ['none','feed','partial','pending']) {
  it(`${status} : attend la récupération, sans bail ni tentative, puis fige le texte complet`, async () => {
    await env.DB.prepare('UPDATE articles SET content_status=? WHERE id=?').bind(status,article).run();
    const d = await dossier();
    const first = await (await prepare(d.id)).json<{item:{id:string;ref:string}}>();
    expect((await (await lease()).json<{item:unknown}>()).item).toBeNull();
    expect(await env.DB.prepare('SELECT status,attempts FROM prepare_queue WHERE id=?').bind(first.item.id).first()).toMatchObject({ status: 'pending', attempts: 0 });
    const pending = await (await call('/atelier/article-texts', { headers })).json<{items:{id:string}[]}>();
    expect(pending.items.some(i => i.id === article)).toBe(true);
    expect((await complete()).status).toBe(200);
    const claimed = await (await lease()).json<{item:{source:{sources:Snapshot[]}}}>();
    expect(claimed.item.source.sources[0]!.text).toBe('Full retrieved article.\n\nSecond paragraph.');
    await env.DB.prepare("UPDATE articles SET content_text='Changed after capture' WHERE id=?").bind(article).run();
    const run = await env.DB.prepare('SELECT sources_json FROM dossier_runs WHERE id=?').bind(first.item.ref).first<{sources_json:string}>();
    expect(JSON.parse(run!.sources_json)[0].text).toContain('Full retrieved');
    const again = await (await prepare(d.id)).json<{item:{id:string}}>();
    expect(again.item.id).toBe(first.item.id);
  });
}

it('refuse unavailable au lancement en 422 sans demande de préparation', async () => {
  const d = await dossier();
  await env.DB.prepare("UPDATE articles SET content_status='unavailable' WHERE id=?").bind(article).run();
  const res = await prepare(d.id);
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: { code: 'article_unavailable' } });
  expect((await env.DB.prepare('SELECT id FROM prepare_queue').all()).results).toHaveLength(0);
});

for (const status of ['partial','unavailable','deleted']) {
  it(`récupération ${status} : échoue sans synthèse tronquée`, async () => {
    await env.DB.prepare("UPDATE articles SET content_status='feed' WHERE id=?").bind(article).run();
    const d = await dossier();
    const queued = await (await prepare(d.id)).json<{item:{id:string}}>();
    if (status === 'deleted') await env.DB.prepare('DELETE FROM articles WHERE id=?').bind(article).run();
    else await complete(status);
    expect((await (await lease()).json<{item:unknown}>()).item).toBeNull();
    expect(await env.DB.prepare('SELECT status,error,attempts FROM prepare_queue WHERE id=?').bind(queued.item.id).first()).toMatchObject({ status: 'failed', attempts: 0, error: expect.stringContaining('article') });
  });
}

it('attend tous les articles sans bloquer un autre dossier prêt', async () => {
  const second = 'b'.repeat(20);
  await env.DB.prepare(`INSERT OR REPLACE INTO articles(id,source_id,guid,url,title,content_status,created_at)
    VALUES (?,'guardian-world','d2-second','https://www.theguardian.com/second','Second','none','2026-10-19')`).bind(second).run();
  await env.DB.prepare("UPDATE articles SET content_status='none' WHERE id=?").bind(article).run();
  const mixed = await create([...refs,{ type: 'article', id: second }]);
  const d = (await mixed.json<{dossier:{id:string}}>()).dossier;
  await prepare(d.id);
  await complete();
  expect((await (await lease()).json<{item:unknown}>()).item).toBeNull();
  const ready = await dossier();
  await prepare(ready.id);
  expect((await (await lease()).json<{item:unknown}>()).item).not.toBeNull();
  await call(`/atelier/article-texts/${second}`, { method: 'POST', headers, body: { status: 'complete', text: 'Full second article.' } });
  expect((await (await lease()).json<{item:{source:{sources:Snapshot[]}}}>()).item.source.sources).toHaveLength(3);
});

it('recontrôle la limite cumulée après récupération, avant tout bail', async () => {
  await env.DB.prepare("UPDATE articles SET content_status='feed' WHERE id=?").bind(article).run();
  const second = 'b'.repeat(20);
  await env.DB.prepare(`INSERT OR REPLACE INTO articles(id,source_id,guid,url,title,content_status,content_text,created_at)
    VALUES (?,'guardian-world','d2-second','https://www.theguardian.com/second','Second','complete',?,'2026-10-19')`)
    .bind(second,'x'.repeat(90000)).run();
  const created = await create([{ type: 'article', id: article },{ type: 'article', id: second }]);
  const d = (await created.json<{dossier:{id:string}}>()).dossier;
  const queued = await (await prepare(d.id)).json<{item:{id:string}}>();
  await complete('complete','y'.repeat(90000));
  expect((await (await lease()).json<{item:unknown}>()).item).toBeNull();
  expect(await env.DB.prepare('SELECT status,attempts,error FROM prepare_queue WHERE id=?').bind(queued.item.id).first())
    .toMatchObject({ status: 'failed', attempts: 0, error: expect.stringContaining('150 000') });
});
