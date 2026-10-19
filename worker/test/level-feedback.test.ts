import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { suggestLevel } from '../src/levels/suggestion';
import { call, login } from './helpers';

const EP = 'a1b2c3d4e5f6a7b8c9d0';
let cookie = '';
async function version(id: string, level = 'B1', show = 's', language = 'en', kind = 'adaptation') {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contents (id,title,original_language,source_type,source_ref,created_at,updated_at)
      VALUES (?,'Test','en','podcast',?,'2026-10-19','2026-10-19')`).bind(id, `episode:${show === 's' ? EP : '11111111111111111111'}`),
    env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,created_at,updated_at)
      VALUES (?,?,?,1,'ready','test','2026-10-19','2026-10-19')`).bind(`pub-${id}`, id, id),
    env.DB.prepare('UPDATE contents SET current_publication_id=? WHERE id=?').bind(`pub-${id}`, id),
    env.DB.prepare(`INSERT INTO variants (publication_id,variant_key,content_id,kind,language,cefr_level,segments_path,timing_source)
      VALUES (?,'en-test',?,?,?,?, 'segments.json','none')`).bind(`pub-${id}`, id, kind, language, level === 'original' ? null : level),
  ]);
}
const feedback = (id: string, rating: unknown, publicationId = `pub-${id}`) => call(
  `/api/contents/${id}/variants/en-test/feedback`, { method: 'POST', cookie, body: { publicationId, rating } },
);
const suggestion = async (show = 's') => {
  const res = await call(`/api/shows/${show}/level-suggestion`, { cookie });
  expect(res.status).toBe(200);
  return (await res.json<{ levelSuggestion: Record<string, unknown> }>()).levelSuggestion;
};
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM level_feedback'), env.DB.prepare('DELETE FROM queue_events'),
    env.DB.prepare('DELETE FROM prepare_queue'), env.DB.prepare('DELETE FROM episodes'),
    env.DB.prepare('DELETE FROM contents'), env.DB.prepare('DELETE FROM publications'),
    env.DB.prepare('DELETE FROM shows'), env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM login_attempts'),
  ]);
  for (const id of ['s', 'other']) {
    await env.DB.prepare(`INSERT INTO shows (id,title,feed_url,language,category,next_check_at,created_at)
      VALUES (?,?,?,'en','news','2026-10-19','2026-10-19')`).bind(id, id, `https://example.com/${id}`).run();
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO episodes (id,show_id,guid,title,audio_url,created_at)
      VALUES (?,'s','g','Test','https://example.com/a.mp3','2026-10-19')`).bind(EP),
    env.DB.prepare(`INSERT INTO episodes (id,show_id,guid,title,audio_url,created_at)
      VALUES ('11111111111111111111','other','g','Test','https://example.com/a.mp3','2026-10-19')`),
  ]);
  cookie = await login();
});

describe('règle de niveau', () => {
  it.each([
    ['A2', 'too_easy', 'B1'], ['B1', 'too_easy', 'B2'], ['B2', 'too_easy', 'C1'], ['C1', 'too_easy', 'original'],
    ['original', 'too_hard', 'C1'], ['C1', 'too_hard', 'B2'], ['B2', 'too_hard', 'B1'], ['B1', 'too_hard', 'A2'],
    ['A2', 'too_hard', 'A2'], ['original', 'too_easy', 'original'],
  ] as const)('%s + deux %s → %s', (level, rating, expected) => {
    expect(suggestLevel(level, [{ level, rating }, { level, rating }])).toMatchObject({
      suggestedLevel: expected, changed: level !== expected,
      reason: level === expected ? 'level_bound' : rating === 'too_easy' ? 'two_too_easy' : 'two_too_hard',
    });
  });
  it('juste, mélange ou changement de niveau interrompent la série', () => {
    for (const ratings of [['just_right', 'just_right'], ['too_easy', 'too_hard']] as const) {
      expect(suggestLevel('B1', ratings.map((rating) => ({ level: 'B1', rating })))).toMatchObject({ reason: 'no_streak' });
    }
    expect(suggestLevel('B1', [{ level: 'B2', rating: 'too_easy' }, { level: 'B1', rating: 'too_easy' }])).toMatchObject({ reason: 'different_levels' });
    expect(suggestLevel('B1', [])).toMatchObject({ reason: 'insufficient_feedback' });
  });
});

describe('API I7', () => {
  it('stocke la version exacte, isole les émissions et propose sans appliquer', async () => {
    await version('episode-one'); await version('episode-two'); await version('episode-other', 'B1', 'other');
    expect(await suggestion()).toMatchObject({ suggestedLevel: 'B1', changed: false });
    expect((await feedback('episode-one', 'too_easy')).status).toBe(200);
    expect((await feedback('episode-other', 'too_hard')).status).toBe(200);
    expect(await suggestion()).toMatchObject({ reason: 'insufficient_feedback' });
    const res = await feedback('episode-two', 'too_easy');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ feedback: { contentId: 'episode-two', publicationId: 'pub-episode-two', variantKey: 'en-test', showId: 's', level: 'B1', rating: 'too_easy' } });
    expect(await suggestion()).toMatchObject({ suggestedLevel: 'B2', changed: true, reason: 'two_too_easy' });
    expect(await (await call(`/api/episodes/${EP}`, { cookie })).json()).toMatchObject({ episode: { levelSuggestion: { suggestedLevel: 'B2' } } });
    expect(await env.DB.prepare("SELECT auto_level FROM shows WHERE id='s'").first('auto_level')).toBe('B1');
    expect((await call('/api/shows/s', { method: 'PATCH', cookie, body: { autoLevel: 'B2' } })).status).toBe(200);
    expect(await suggestion()).toMatchObject({ currentLevel: 'B2', suggestedLevel: 'B2', reason: 'different_levels' });
    expect(await suggestion('other')).toMatchObject({ reason: 'insufficient_feedback' });
  });
  it('ne double pas les retours et recalcule après correction ou annulation', async () => {
    await version('episode-one'); await version('episode-two');
    await feedback('episode-one', 'too_easy'); await feedback('episode-one', 'too_easy');
    expect(await suggestion()).toMatchObject({ reason: 'insufficient_feedback' });
    await feedback('episode-two', 'too_easy');
    expect(await suggestion()).toMatchObject({ suggestedLevel: 'B2' });
    await feedback('episode-one', 'just_right');
    expect(await suggestion()).toMatchObject({ changed: false, reason: 'no_streak' });
    await feedback('episode-one', 'too_hard'); await feedback('episode-two', 'too_hard');
    expect(await suggestion()).toMatchObject({ suggestedLevel: 'A2' });
    expect(await (await feedback('episode-one', null)).json()).toMatchObject({ feedback: null, levelSuggestion: { reason: 'insufficient_feedback' } });
    expect((await feedback('episode-one', null)).status).toBe(200);
  });
  it('ne réordonne pas les corrections et ne saute pas un avis juste ou un autre niveau', async () => {
    await version('episode-one'); await version('episode-two'); await version('episode-three');
    await feedback('episode-one', 'too_easy'); await feedback('episode-two', 'too_easy');
    await feedback('episode-three', 'just_right'); await feedback('episode-one', 'too_easy');
    expect(await suggestion()).toMatchObject({ reason: 'no_streak' });
    await feedback('episode-three', null);
    expect(await suggestion()).toMatchObject({ suggestedLevel: 'B2' });
    await version('episode-four', 'B2'); await feedback('episode-four', 'too_easy');
    expect(await suggestion()).toMatchObject({ reason: 'different_levels' });
  });
  it('accepte l’original anglais et reste borné', async () => {
    await env.DB.prepare("UPDATE shows SET auto_level='original' WHERE id='s'").run();
    for (const id of ['episode-one', 'episode-two']) {
      await version(id, 'original', 's', 'en', 'source');
      expect((await feedback(id, 'too_easy')).status).toBe(200);
    }
    expect(await suggestion()).toMatchObject({ suggestedLevel: 'original', reason: 'level_bound' });
  });
  it('rejette les corps invalides sans écrire', async () => {
    await version('episode-one');
    for (const body of [null, [], {}, { rating: 'easy' }, { publicationId: 'pub-episode-one' },
      { publicationId: 'pub-episode-one', rating: false }, { publicationId: 'pub-episode-one', rating: 'too_easy', level: 'C1' }]) {
      expect((await call('/api/contents/episode-one/variants/en-test/feedback', { method: 'POST', cookie, body })).status).toBe(400);
    }
    expect((await feedback('episode-one', 'too_easy', 'x'.repeat(1100))).status).toBe(413);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM level_feedback').first('n')).toBe(0);
  });
  it('refuse les versions absentes, invisibles, sans émission et non anglaises', async () => {
    await version('episode-one'); await version('episode-french', 'original', 's', 'fr', 'source');
    expect((await feedback('episode-one', 'too_easy', 'wrong-publication')).status).toBe(404);
    expect((await feedback('missing-content', 'too_easy')).status).toBe(404);
    expect((await feedback('episode-french', 'too_easy')).status).toBe(422);
    expect((await call('/api/shows/missing/level-suggestion', { cookie })).status).toBe(404);
    await env.DB.prepare("UPDATE contents SET source_type='reflection',source_ref=NULL WHERE id='episode-one'").run();
    expect((await feedback('episode-one', 'too_easy')).status).toBe(404);
    await env.DB.prepare("UPDATE contents SET deleted_at='2026-10-19' WHERE id='episode-french'").run();
    expect((await feedback('episode-french', 'too_easy')).status).toBe(404);
  });
  it('accepte une révision précédente encore lisible et refuse une révision expirée', async () => {
    await version('episode-one');
    await env.DB.batch([
      env.DB.prepare("UPDATE publications SET status='superseded',superseded_at=? WHERE id='pub-episode-one'").bind(new Date().toISOString()),
      env.DB.prepare("UPDATE contents SET current_publication_id=NULL WHERE id='episode-one'"),
    ]);
    expect((await feedback('episode-one', 'too_easy')).status).toBe(200);
    await env.DB.prepare("UPDATE publications SET superseded_at='2020-01-01' WHERE id='pub-episode-one'").run();
    expect((await feedback('episode-one', 'too_easy')).status).toBe(404);
  });
  it('rattache les vidéos à leur chaîne et déduit le niveau de la variante', async () => {
    await version('episode-video');
    await env.DB.batch([
      env.DB.prepare("UPDATE shows SET source_type='youtube',channel_id='UC1234567890123456789012' WHERE id='s'"),
      env.DB.prepare("UPDATE episodes SET video_id='abcdefghijk' WHERE id=?").bind(EP),
      env.DB.prepare("UPDATE contents SET source_type='youtube',source_ref='youtube:abcdefghijk' WHERE id='episode-video'"),
    ]);
    expect(await (await feedback('episode-video', 'too_hard')).json()).toMatchObject({ feedback: { showId: 's', level: 'B1' } });
    await env.DB.prepare("UPDATE variants SET cefr_level=NULL WHERE content_id='episode-video'").run();
    expect((await feedback('episode-video', 'too_easy')).status).toBe(422);
    await env.DB.prepare("UPDATE variants SET cefr_level='C2' WHERE content_id='episode-video'").run();
    expect((await feedback('episode-video', 'too_easy')).status).toBe(422);
  });
  it('applique session et CSRF', async () => {
    expect((await call('/api/shows/s/level-suggestion')).status).toBe(401);
    expect((await call('/api/contents/episode-one/variants/en-test/feedback', { method: 'POST', body: {} })).status).toBe(401);
    expect((await call('/api/contents/episode-one/variants/en-test/feedback', { method: 'POST', cookie, body: {}, pwa: false })).status).toBe(403);
  });
});
