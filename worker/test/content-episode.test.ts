import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { call, login } from './helpers';
async function fixture(sourceType: string, sourceRef: string) {
  const id = `association-${crypto.randomUUID()}`, p = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO contents (id,title,original_language,source_type,source_ref,created_at,updated_at)
    VALUES (?,'Test','en',?,?,'2026-10-19','2026-10-19')`).bind(id, sourceType, sourceRef).run();
  await env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,created_at,updated_at)
    VALUES (?,?,?,1,'ready',?,'2026-10-19','2026-10-19')`).bind(p, id, p, `test/${p}`).run();
  await env.DB.prepare('UPDATE contents SET current_publication_id=? WHERE id=?').bind(p, id).run();
  await env.FILES.put(`test/${p}`, JSON.stringify({ content: { id, title: 'Test', sourceType }, variants: [], files: {} }));
  return id;
}
it.each(['podcast', 'youtube'])('retrouve l’émission du contenu %s', async (type) => {
  const show = crypto.randomUUID(), ep = crypto.randomUUID(), video = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO shows (id,title,feed_url,language,category,next_check_at,created_at)
    VALUES (?,'Test',?,'en','news','2026-10-19','2026-10-19')`).bind(show, `https://example.com/${show}`).run();
  await env.DB.prepare(`INSERT INTO episodes (id,show_id,guid,title,audio_url,video_id,created_at)
    VALUES (?,?,'guid','Test','https://example.com/audio',?,'2026-10-19')`).bind(ep, show, video).run();
  const id = await fixture(type, type === 'podcast' ? `episode:${ep}` : `youtube:${video}`);
  const response = await call(`/api/contents/${id}`, { cookie: await login() });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ content: { id, title: 'Test' }, episode: { id: ep, showId: show } });
});
it('ne crée pas de fausse émission pour une vidéo non suivie ou une note', async () => {
  for (const [type, ref] of [['youtube', 'youtube:unknown'], ['reflection', 'reflection:note']]) {
    const id = await fixture(type!, ref!);
    const response = await call(`/api/contents/${id}`, { cookie: await login() });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ episode: null });
  }
});
