import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { youtubeId } from '../src/routes/queue';
import { ATELIER_TOKEN, call, login } from './helpers';

const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const NOTE = '7d2f9c6e-8b2a-4c7d-9e10-2a3b4c5d6e7f';
const lease = async () => (await (await call('/atelier/queue/lease', { method: 'POST', pwa: false, headers, body: { owner: 'mac' } }))
  .json<{ item: { id: string; kind: string; source: Record<string, unknown> } | null }>()).item;

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM prepare_queue'), env.DB.prepare('DELETE FROM reflection_links'), env.DB.prepare('DELETE FROM reflections')]);
});

describe('liens YouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'], ['https://youtu.be/dQw4w9WgXcQ?si=x', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'], ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://evil.example/watch?v=dQw4w9WgXcQ', null], ['pas une url', null], ['https://youtu.be/court', null],
  ])('%s → %s', (url, id) => expect(youtubeId(url)).toBe(id));
});

describe('sources envoyées par l’Atelier', () => {
  it('un lien YouTube devient une demande, louée avec sa source', async () => {
    const res = await call('/atelier/sources', { method: 'POST', pwa: false, headers, body: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', options: { coverage: 'condensed', targetMinutes: 10 } } });
    expect(res.status).toBe(201);
    const item = await lease();
    expect(item).toMatchObject({ kind: 'youtube', source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
    expect((await call('/atelier/sources', { method: 'POST', pwa: false, headers, body: { kind: 'youtube', url: 'https://example.com/v' } })).status).toBe(422);
  });

  it('un texte importé devient une note My Mind « importé depuis l’Atelier » et une demande', async () => {
    const text = 'La dette publique française dépasse 3 000 milliards d’euros. Pourquoi est-ce important ?';
    const res = await call('/atelier/sources', { method: 'POST', pwa: false, headers, body: { kind: 'text', title: 'Dette', text } });
    expect(res.status).toBe(201);
    const note = await env.DB.prepare('SELECT title, body_md, tags_json FROM reflections').first<{ title: string; body_md: string; tags_json: string }>();
    expect(note).toMatchObject({ title: 'Dette', body_md: text });
    expect(JSON.parse(note!.tags_json)).toEqual(['importé depuis l’Atelier']);
    const item = await lease();
    expect(item).toMatchObject({ kind: 'reflection', source: { kind: 'reflection', title: 'Dette', text } });
    expect((await call('/atelier/sources', { method: 'POST', pwa: false, headers, body: { kind: 'text', text: 'court' } })).status).toBe(422);
  });
});

describe('note envoyée depuis l’app', () => {
  it('« Préparer en anglais » crée une demande pour la note, visible dans sa file', async () => {
    const cookie = await login();
    await call('/api/reflections', { method: 'POST', cookie, body: { id: NOTE, title: 'Idée', body: 'Une réflexion assez longue pour être préparée en anglais.' } });
    const res = await call(`/api/reflections/${NOTE}/prepare`, { method: 'POST', cookie, body: {} });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ item: { kind: 'reflection', ref: NOTE, options: { coverage: 'full', level: 'B1' } } });
    const queue = await (await call(`/api/queue?reflection=${NOTE}`, { cookie })).json<{ items: { ref: string }[] }>();
    expect(queue.items.map((i) => i.ref)).toEqual([NOTE]);
    const item = await lease();
    expect(item?.source).toMatchObject({ kind: 'reflection', id: NOTE, title: 'Idée' });
  });

  it('refuse une note trop courte ou inconnue', async () => {
    const cookie = await login();
    await call('/api/reflections', { method: 'POST', cookie, body: { id: NOTE, body: 'Trop court.' } });
    expect((await call(`/api/reflections/${NOTE}/prepare`, { method: 'POST', cookie, body: {} })).status).toBe(422);
    expect((await call('/api/reflections/11111111-2222-4333-8444-555555555555/prepare', { method: 'POST', cookie, body: {} })).status).toBe(404);
  });
});
