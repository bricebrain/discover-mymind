import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { call, login } from './helpers';
import { MAX_SHOWS } from '../src/routes/shows';

it('les archives désactivées ne comptent pas dans la limite ; une réactivation la respecte', async () => {
  await env.DB.prepare('DELETE FROM episodes').run();
  await env.DB.prepare('DELETE FROM shows').run();
  await env.DB.batch(Array.from({ length: MAX_SHOWS + 1 }, (_, i) => env.DB.prepare(
    `INSERT INTO shows (id,title,feed_url,language,category,enabled,next_check_at,created_at)
     VALUES (?, ?, ?, 'en', 'humour', ?, '2026-10-18', '2026-10-18')`,
  ).bind(`show-${i}`, `Émission ${i}`, `https://feeds.example.com/${i}.xml`, i < MAX_SHOWS ? 1 : 0)));
  const cookie = await login();
  const add = () => call('/api/shows', { method: 'POST', cookie, body: {
    title: 'Nouveau récit', feedUrl: 'https://feeds.example.com/new.xml', language: 'fr', category: 'humour',
  } });
  expect((await add()).status).toBe(409);
  expect((await call(`/api/shows/show-${MAX_SHOWS}`, { method: 'PATCH', cookie, body: { enabled: true } })).status).toBe(409);
  expect((await call('/api/shows/show-0', { method: 'PATCH', cookie, body: { enabled: false } })).status).toBe(200);
  expect((await add()).status).toBe(201);
  const response = await call('/api/explorer?category=humour', { cookie });
  expect(response.status).toBe(200);
});
