import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { ATELIER_TOKEN, call } from './helpers';

const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const ep = 'c'.repeat(20);

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM prepare_queue').run();
  await env.DB.prepare("INSERT OR IGNORE INTO episodes (id,show_id,guid,title,audio_url,duration_sec,created_at) SELECT ?,id,'atelier-browse','Épisode depuis l’Atelier','https://example.com/a.mp3',3000,'2026-10-18' FROM shows WHERE enabled=1 LIMIT 1").bind(ep).run();
});

it('l’Atelier liste les émissions et les épisodes avec son jeton seulement', async () => {
  expect((await call('/atelier/episodes', { pwa: false })).status).toBe(401);
  const shows = await (await call('/atelier/shows', { pwa: false, headers })).json<{ shows: unknown[] }>();
  expect(shows.shows.length).toBeGreaterThan(0);
  const list = await (await call('/atelier/episodes', { pwa: false, headers })).json<{ episodes: { id: string }[] }>();
  expect(list.episodes.some((e) => e.id === ep)).toBe(true);
});

it('l’Atelier lance une préparation (options par défaut selon la durée), puis l’annule et la relance', async () => {
  const created = await call(`/atelier/episodes/${ep}/prepare`, { method: 'POST', pwa: false, headers, body: {} });
  expect(created.status).toBe(201);
  const { item } = await created.json<{ item: { id: string; options: { coverage: string; targetMinutes: number } } }>();
  expect(item.options).toMatchObject({ coverage: 'condensed', targetMinutes: 12 });
  expect((await call(`/atelier/queue/${item.id}/cancel`, { method: 'POST', pwa: false, headers, body: {} })).status).toBe(204);
  expect((await call(`/atelier/queue/${item.id}/retry`, { method: 'POST', pwa: false, headers, body: {} })).status).toBe(204);
  const queue = await (await call(`/atelier/queue?episode=${ep}`, { pwa: false, headers })).json<{ items: { status: string }[] }>();
  expect(queue.items[0]!.status).toBe('pending');
  expect((await call(`/atelier/episodes/${ep}/prepare`, { method: 'POST', pwa: false, headers, body: { coverage: 'nope' } })).status).toBe(422);
});
