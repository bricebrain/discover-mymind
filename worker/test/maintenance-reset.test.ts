import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { ATELIER_TOKEN, call } from './helpers';
import { collectionCutoff } from '../src/retention';

const BEFORE = '2026-10-27T10:00:00.000Z';
const NOTE = 'c1234567-1234-1234-1234-123456789012';
const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const request = (body: unknown) => call('/atelier/maintenance/reset-publications', { method: 'POST', headers, body });

beforeEach(async () => {
  await env.DB.batch(['DELETE FROM quiz_answers', 'DELETE FROM dictation_attempts', 'DELETE FROM listening_reviews', 'DELETE FROM variants',
    'DELETE FROM publication_files', 'DELETE FROM contents', 'DELETE FROM publications', 'DELETE FROM cloud_operations', 'DELETE FROM cloud_runs',
    'DELETE FROM cloud_quotes', 'DELETE FROM prepare_queue', 'DELETE FROM reflections', "DELETE FROM app_settings WHERE key='content_reset_at'"].map(s => env.DB.prepare(s)));
  for (const [id, at] of [['old', '2026-10-26T10:00:00.000Z'], ['new', '2026-10-28T10:00:00.000Z']]) {
    await env.DB.prepare(`INSERT INTO contents(id,title,original_language,source_type,created_at,updated_at)
      VALUES (?,'Contenu','fr','reflection',?,?)`).bind(`reset-${id}`, at, at).run();
    await env.DB.prepare(`INSERT INTO publications(id,content_id,revision,seq,status,manifest_r2_key,created_at,updated_at)
      VALUES (?,?,?,1,'ready',?,?,?)`).bind(`reset-pub-${id}`, `reset-${id}`, `revision-${id}`, `reset-manifest-${id}`, at, at).run();
    await env.DB.prepare('UPDATE contents SET current_publication_id=? WHERE id=?').bind(`reset-pub-${id}`, `reset-${id}`).run();
    await env.DB.prepare(`INSERT INTO publication_files(publication_id,path,sha256,size,content_type,r2_key)
      VALUES (?,'audio.mp3',?,3,'audio/mpeg',?)`).bind(`reset-pub-${id}`, id!.padEnd(64, '0'), `reset-audio-${id}`).run();
    await env.FILES.put(`reset-audio-${id}`, 'mp3');
    await env.FILES.put(`reset-manifest-${id}`, '{}');
  }
  await env.DB.prepare(`INSERT INTO reflections(id,title,body_md,kind,tags_json,created_at,updated_at,english_content_id)
    VALUES (?,'Note personnelle','Mon texte à conserver','observation','[]','2026-10-25','2026-10-25','reset-old')`).bind(NOTE).run();
});

it('exige le jeton Atelier et une confirmation explicite avant toute suppression', async () => {
  expect((await call('/atelier/maintenance/reset-publications', { method: 'POST', body: { before: BEFORE } })).status).toBe(401);
  expect((await request({ before: BEFORE })).status).toBe(422);
  const dry = await request({ before: BEFORE, dryRun: true });
  expect(dry.status).toBe(200);
  expect(await dry.json()).toMatchObject({ contents: 1, notesKept: 1 });
  expect(await env.FILES.get('reset-audio-old')).not.toBeNull();
});

it('supprime les publications et leurs fichiers avant la coupure, conserve notes, réglages et nouveaux contenus', async () => {
  const settings = await env.DB.prepare("SELECT value FROM app_settings WHERE key='auto_prepare_enabled'").first();
  const response = await request({ before: BEFORE, confirm: 'RESET_PUBLICATIONS_KEEP_NOTES' });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toMatchObject({ contents: 0, files: 0, manifests: 0, notesKept: 1 });
  expect(await env.FILES.get('reset-audio-old')).toBeNull();
  expect(await env.FILES.get('reset-manifest-old')).toBeNull();
  expect(await env.FILES.get('reset-audio-new')).not.toBeNull();
  expect(await env.DB.prepare('SELECT deleted_at FROM contents WHERE id=?').bind('reset-new').first()).toEqual({ deleted_at: null });
  expect(await env.DB.prepare('SELECT body_md,english_content_id FROM reflections WHERE id=?').bind(NOTE).first())
    .toEqual({ body_md: 'Mon texte à conserver', english_content_id: null });
  expect(await env.DB.prepare("SELECT value FROM app_settings WHERE key='auto_prepare_enabled'").first()).toEqual(settings);
  expect(await collectionCutoff(env, Date.parse('2026-10-27T12:00:00Z'))).toBe(Date.parse(BEFORE));
  expect((await request({ before: BEFORE, confirm: 'RESET_PUBLICATIONS_KEEP_NOTES' })).status).toBe(200);
});
