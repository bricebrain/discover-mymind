import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { purgeTrash } from '../src/routes/reflections';
import { call, login } from './helpers';

const NOTE = '3f1d9c6e-8b2a-4c7d-9e10-2a3b4c5d6e7f';
const EP = 'a1b2c3d4e5f6a7b8c9d0';

let cookie = '';
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reflection_links'), env.DB.prepare('DELETE FROM reflections'),
    env.DB.prepare('DELETE FROM episodes'), env.DB.prepare('DELETE FROM shows'),
    env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM login_attempts'),
  ]);
  await env.DB.prepare(`INSERT INTO shows (id, title, feed_url, language, category, next_check_at, created_at)
    VALUES ('s', 'Code source', 'https://feeds.example.com/s.xml', 'fr', 'news', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z')`).run();
  await env.DB.prepare(`INSERT INTO episodes (id, show_id, guid, title, audio_url, created_at)
    VALUES (?, 's', 'g', 'La dette américaine', 'https://cdn.example.com/a.mp3', '2026-10-17T00:00:00Z')`).bind(EP).run();
  cookie = await login();
});

type Note = { id: string; title: string | null; body: string; updatedAt: string; deletedAt: string | null; links: { targetTitle: string; quote: string | null }[] };
const create = (body: Record<string, unknown>) => call('/api/reflections', { method: 'POST', cookie, body });
const patch = (body: Record<string, unknown>) => call(`/api/reflections/${NOTE}`, { method: 'PATCH', cookie, body });

describe('My Mind', () => {
  it('crée une note sans source, puis la retrouve dans la liste', async () => {
    const res = await create({ id: NOTE, title: 'Idée', body: '# Pourquoi\n\nUne pensée.' });
    expect(res.status).toBe(201);
    const list = await (await call('/api/reflections', { cookie })).json<{ reflections: { id: string; excerpt: string; linkCount: number }[] }>();
    expect(list.reflections).toMatchObject([{ id: NOTE, linkCount: 0 }]);
    expect(list.reflections[0]!.excerpt).toContain('Une pensée');
  });

  it('la création est idempotente (renvoi après une coupure réseau)', async () => {
    expect((await create({ id: NOTE, body: 'a' })).status).toBe(201);
    const again = await create({ id: NOTE, body: 'a' });
    expect(again.status).toBe(200);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM reflections').first('n')).toBe(1);
  });

  it('crée une note liée à un épisode, avec le titre de l’épisode gardé dans le lien', async () => {
    await create({ id: NOTE, body: 'Réaction', links: [{ targetType: 'episode', targetId: EP, quote: 'le dollar reste dominant' }] });
    const { reflection } = await (await call(`/api/reflections/${NOTE}`, { cookie })).json<{ reflection: Note }>();
    expect(reflection.links).toEqual([expect.objectContaining({ targetTitle: 'La dette américaine — Code source', quote: 'le dollar reste dominant' })]);
    expect((await create({ id: '11111111-2222-4333-8444-555555555555', body: 'x', links: [{ targetType: 'episode', targetId: 'ffffffffffffffffffff' }] })).status).toBe(422);
  });

  it('une modification avec la bonne base passe ; une modification concurrente reçoit 409 avec la version courante', async () => {
    const { reflection } = await (await create({ id: NOTE, body: 'v1' })).json<{ reflection: Note }>();
    const ok = await patch({ baseUpdatedAt: reflection.updatedAt, body: 'v2 depuis le téléphone' });
    expect(ok.status).toBe(200);
    const stale = await patch({ baseUpdatedAt: reflection.updatedAt, body: 'v2 depuis le Mac' });
    expect(stale.status).toBe(409);
    const body = await stale.json<{ current: Note }>();
    expect(body.current.body).toBe('v2 depuis le téléphone');
  });

  it('corbeille : la note disparaît de la liste, se restaure, et n’est purgée qu’après 30 jours', async () => {
    await create({ id: NOTE, body: 'à jeter' });
    expect((await call(`/api/reflections/${NOTE}`, { method: 'DELETE', cookie })).status).toBe(204);
    const list = await (await call('/api/reflections', { cookie })).json<{ reflections: unknown[] }>();
    expect(list.reflections).toHaveLength(0);
    const trash = await (await call('/api/reflections?trash=1', { cookie })).json<{ reflections: unknown[] }>();
    expect(trash.reflections).toHaveLength(1);
    expect((await call(`/api/reflections/${NOTE}/restore`, { method: 'POST', cookie, body: {} })).status).toBe(200);

    await call(`/api/reflections/${NOTE}`, { method: 'DELETE', cookie });
    expect(await purgeTrash(env, Date.now() + 29 * 86_400_000)).toBe(0);
    expect(await purgeTrash(env, Date.now() + 31 * 86_400_000)).toBe(1);
  });

  it('supprimer l’épisode lié laisse la note et son lien lisibles', async () => {
    await create({ id: NOTE, body: 'garde-moi', links: [{ targetType: 'episode', targetId: EP }] });
    await env.DB.prepare('DELETE FROM episodes').run();
    const { reflection } = await (await call(`/api/reflections/${NOTE}`, { cookie })).json<{ reflection: Note }>();
    expect(reflection.body).toBe('garde-moi');
    expect(reflection.links[0]!.targetTitle).toBe('La dette américaine — Code source');
  });

  it('refuse un identifiant non UUID et un texte trop long', async () => {
    expect((await create({ id: '../x', body: 'a' })).status).toBe(400);
    expect((await create({ id: NOTE, body: 'x'.repeat(100_001) })).status).toBe(400);
  });

  it('l’export contient les notes, leurs liens et leur Markdown', async () => {
    await create({ id: NOTE, title: 'Dette', body: 'Mes notes.', tags: ['économie'], links: [{ targetType: 'episode', targetId: EP }] });
    const res = await call('/api/export', { cookie });
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="discover-export-\d{4}-\d{2}-\d{2}\.json"/);
    const data = await res.json<{ reflections: Note[]; markdown: string }>();
    expect(data.reflections).toHaveLength(1);
    expect(data.markdown).toContain('# Dette');
    expect(data.markdown).toContain('#économie');
    expect(data.markdown).toContain('La dette américaine — Code source');
  });
});
