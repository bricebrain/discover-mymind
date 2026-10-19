import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { ATELIER_TOKEN, call, login } from './helpers';

let cookie = '';
beforeEach(async () => { cookie = await login(); await env.DB.prepare('DELETE FROM prepare_queue').run(); });

it('une note Article garde son journal et son lien, modifiables, et les transmet à l’Atelier', async () => {
  const id = crypto.randomUUID();
  const created = await call('/api/reflections', { method: 'POST', cookie, body: {
    id, title: 'Debt ceiling', body: 'The debt ceiling debate returns to Washington this autumn, with deep divisions.',
    origin: 'article', sourceName: 'The Guardian', sourceUrl: 'https://www.theguardian.com/us-news/debt' } });
  expect(created.status, await created.clone().text()).toBe(201);
  const { reflection } = await created.json<{ reflection: { origin: string; sourceName: string; sourceUrl: string; updatedAt: string } }>();
  expect(reflection).toMatchObject({ origin: 'article', sourceName: 'The Guardian', sourceUrl: 'https://www.theguardian.com/us-news/debt' });
  const list = await (await call('/api/reflections', { cookie })).json<{ reflections: { id: string; origin: string; sourceName: string }[] }>();
  expect(list.reflections.find((r) => r.id === id)).toMatchObject({ origin: 'article', sourceName: 'The Guardian' });
  const patched = await call(`/api/reflections/${id}`, { method: 'PATCH', cookie, body: { baseUpdatedAt: reflection.updatedAt, origin: 'personal', sourceName: '', sourceUrl: '' } });
  expect(patched.status, await patched.clone().text()).toBe(200);
  expect((await patched.json<{ reflection: { origin: string; sourceName: null } }>()).reflection).toMatchObject({ origin: 'personal', sourceName: null });

  await env.DB.prepare("UPDATE reflections SET origin='article', source_name='The Guardian' WHERE id=?").bind(id).run();
  await call(`/api/reflections/${id}/prepare`, { method: 'POST', cookie, body: {} });
  const lease = await (await call('/atelier/queue/lease', { method: 'POST', headers: { Authorization: `Bearer ${ATELIER_TOKEN}` }, body: { owner: 'mac' } })).json<{ item: { source: Record<string, unknown> } }>();
  expect(lease.item.source).toMatchObject({ kind: 'reflection', origin: 'article', sourceName: 'The Guardian' });
});

it('refuse une origine ou un lien invalides', async () => {
  const base = { title: 'X', body: 'Un texte suffisamment long pour une note.' };
  expect((await call('/api/reflections', { method: 'POST', cookie, body: { ...base, id: crypto.randomUUID(), origin: 'blog' } })).status).toBe(400);
  expect((await call('/api/reflections', { method: 'POST', cookie, body: { ...base, id: crypto.randomUUID(), origin: 'article', sourceUrl: 'javascript:alert(1)' } })).status).toBe(400);
});
