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

it('récupération d’un article : demande, résultat écrit seulement dans une note vide, sinon conservé', async () => {
  const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
  const id = crypto.randomUUID();
  await call('/api/reflections', { method: 'POST', cookie, body: { id, title: '', body: '', origin: 'article', sourceName: 'The Guardian', sourceUrl: 'https://www.theguardian.com/world/x' } });
  expect((await call(`/api/reflections/${id}/fetch`, { method: 'POST', cookie, body: {} })).status).toBe(202);
  const list = await (await call('/atelier/article-fetches', { headers })).json<{ items: { id: string; url: string }[] }>();
  expect(list.items.find((i) => i.id === id)?.url).toBe('https://www.theguardian.com/world/x');
  const done = await call(`/atelier/article-fetches/${id}`, { method: 'POST', headers, body: { status: 'complete', title: 'Lagos hypemen', text: 'Hypemen are redefining Afrobeats.' } });
  expect(await done.json()).toEqual({ articleFetch: 'complete' });
  const note = await (await call(`/api/reflections/${id}`, { cookie })).json<{ reflection: { body: string; title: string; articleFetch: string } }>();
  expect(note.reflection).toMatchObject({ body: 'Hypemen are redefining Afrobeats.', title: 'Lagos hypemen', articleFetch: 'complete' });
  expect((await call(`/api/reflections/${id}/fetch`, { method: 'POST', cookie, body: {} })).status).toBe(409);

  // L'utilisateur écrit pendant que l'Atelier travaille : son texte est gardé.
  const other = crypto.randomUUID();
  await call('/api/reflections', { method: 'POST', cookie, body: { id: other, body: '', origin: 'article', sourceUrl: 'https://www.bbc.co.uk/news/y' } });
  await call(`/api/reflections/${other}/fetch`, { method: 'POST', cookie, body: {} });
  await env.DB.prepare("UPDATE reflections SET body_md='Mon texte' WHERE id=?").bind(other).run();
  expect(await (await call(`/atelier/article-fetches/${other}`, { method: 'POST', headers, body: { status: 'complete', text: 'Texte récupéré.' } })).json()).toEqual({ articleFetch: 'skipped' });
  expect((await env.DB.prepare('SELECT body_md FROM reflections WHERE id=?').bind(other).first<{ body_md: string }>())?.body_md).toBe('Mon texte');
});

it('récupération d’un article : refus hors note Article, et page inaccessible', async () => {
  const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
  const personal = crypto.randomUUID();
  await call('/api/reflections', { method: 'POST', cookie, body: { id: personal, body: '' } });
  expect((await call(`/api/reflections/${personal}/fetch`, { method: 'POST', cookie, body: {} })).status).toBe(422);
  const id = crypto.randomUUID();
  await call('/api/reflections', { method: 'POST', cookie, body: { id, body: '', origin: 'article', sourceUrl: 'https://www.lemonde.fr/x' } });
  await call(`/api/reflections/${id}/fetch`, { method: 'POST', cookie, body: {} });
  expect((await call(`/atelier/article-fetches/${id}`, { method: 'POST', headers, body: { status: 'done' } })).status).toBe(422);
  expect(await (await call(`/atelier/article-fetches/${id}`, { method: 'POST', headers, body: { status: 'unavailable' } })).json()).toEqual({ articleFetch: 'unavailable' });
  expect((await call(`/atelier/article-fetches/${id}`, { method: 'POST', body: { status: 'unavailable' } })).status).toBe(401);
});
