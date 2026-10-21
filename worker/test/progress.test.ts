import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, login } from './helpers';

const EP = 'a1b2c3d4e5f6a7b8c9d0';
const AUDIO = 'https://cdn.example.com/ep.mp3';

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM listening_progress'), env.DB.prepare('DELETE FROM episodes'), env.DB.prepare('DELETE FROM shows'),
    env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM login_attempts'),
  ]);
  await env.DB.prepare(`INSERT INTO shows (id, title, feed_url, language, category, next_check_at, created_at, source_type)
    VALUES ('s', 'Show', 'https://feeds.example.com/s.xml', 'fr', 'news', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z', 'youtube')`).run();
  await env.DB.prepare(`INSERT INTO episodes (id, show_id, guid, title, audio_url, created_at)
    VALUES (?, 's', 'g', 'Épisode', ?, '2026-10-17T00:00:00Z')`).bind(EP, AUDIO).run();
});

const put = (cookie: string, body: Record<string, unknown>) => call('/api/progress', { method: 'PUT', cookie, body });

describe('progression d’écoute', () => {
  it('enregistre puis remplace la position d’un épisode', async () => {
    const cookie = await login();
    expect((await put(cookie, { targetType: 'episode', targetId: EP, audioRef: AUDIO, positionMs: 61_000, durationMs: 600_000 })).status).toBe(200);
    expect((await put(cookie, { targetType: 'episode', targetId: EP, audioRef: AUDIO, positionMs: 125_400, durationMs: 600_000 })).status).toBe(200);
    const r = await (await call(`/api/progress/episode/${EP}?audioRef=${encodeURIComponent(AUDIO)}`, { cookie })).json<{ progress: { positionMs: number; completed: boolean } }>();
    expect(r.progress).toMatchObject({ positionMs: 125_400, completed: false });
  });

  it('ne rend pas la position si l’audio a changé', async () => {
    const cookie = await login();
    await put(cookie, { targetType: 'episode', targetId: EP, audioRef: AUDIO, positionMs: 61_000 });
    const r = await (await call(`/api/progress/episode/${EP}?audioRef=${encodeURIComponent('https://cdn.example.com/autre.mp3')}`, { cookie })).json();
    expect(r).toEqual({ progress: null });
  });

  it('la progression apparaît dans Explorer et le détail tant que l’audio est le même', async () => {
    const cookie = await login();
    await put(cookie, { targetType: 'episode', targetId: EP, audioRef: AUDIO, positionMs: 30_000, durationMs: 60_000, completed: true });
    const list = await (await call('/api/explorer', { cookie })).json<{ episodes: Record<string, unknown>[] }>();
    expect(list.episodes[0]).toMatchObject({ progressMs: 30_000, progressDurationMs: 60_000, progressCompleted: 1 });
    await env.DB.prepare('UPDATE episodes SET audio_url = ?').bind('https://cdn.example.com/nouveau.mp3').run();
    const detail = await (await call(`/api/episodes/${EP}`, { cookie })).json<{ episode: Record<string, unknown> }>();
    expect(detail.episode.progressMs).toBeNull();
  });

  it('refuse une cible ou une position invalide', async () => {
    const cookie = await login();
    expect((await put(cookie, { targetType: 'episode', targetId: '../x', audioRef: AUDIO, positionMs: 1 })).status).toBe(400);
    expect((await put(cookie, { targetType: 'other', targetId: EP, audioRef: AUDIO, positionMs: 1 })).status).toBe(400);
    expect((await put(cookie, { targetType: 'episode', targetId: EP, audioRef: AUDIO, positionMs: -5 })).status).toBe(400);
    expect((await put(cookie, { targetType: 'episode', targetId: EP, audioRef: '', positionMs: 5 })).status).toBe(400);
    expect((await put(cookie, { targetType: 'variant', targetId: 'mon-contenu:en-b1', audioRef: 'sha', positionMs: 5 })).status).toBe(200);
  });

  it('garde des positions indépendantes pour chaque version et remet seulement l’audio remplacé à zéro', async () => {
    const cookie = await login();
    await put(cookie,{ targetType:'variant',targetId:'mon-contenu:en-b1',audioRef:'sha-full',positionMs:61000 });
    await put(cookie,{ targetType:'variant',targetId:'mon-contenu:en-condensed',audioRef:'sha-condensed',positionMs:12000 });
    const read = async (key: string,ref: string) => (await call(`/api/progress/variant/mon-contenu%3A${key}?audioRef=${ref}`,{ cookie })).json();
    expect(await read('en-b1','sha-full')).toMatchObject({ progress:{ positionMs:61000 } });
    expect(await read('en-condensed','sha-condensed')).toMatchObject({ progress:{ positionMs:12000 } });
    expect(await read('en-b1','sha-full-new')).toEqual({ progress:null });
    expect(await read('en-condensed','sha-condensed')).toMatchObject({ progress:{ positionMs:12000 } });
  });

  it('exige une session', async () => {
    expect((await call('/api/progress', { method: 'PUT', body: {} })).status).toBe(401);
  });
});

describe('transcriptions des flux', () => {
  beforeEach(async () => {
    await env.FILES.delete(`transcripts/${EP}.srt`);
  });

  const SRT = '1\n00:00:01,000 --> 00:00:03,000\nSpeaker 1: Hello.\n';
  const fetcherFor = (body: string, status = 200) => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(body, { status }); }) as unknown as typeof fetch;
    return { f, calls: () => calls };
  };

  it('récupère le SRT une fois, le garde dans R2, puis le sert depuis le cache', async () => {
    const { getTranscript } = await import('../src/routes/transcripts');
    await env.DB.prepare("UPDATE episodes SET transcript_url = 'https://cdn.example.com/t.srt', transcript_type = 'srt'").run();
    const { f, calls } = fetcherFor(SRT);
    const first = await (await getTranscript(env, EP, f)).json<{ type: string; text: string; audioRef: string }>();
    expect(first).toEqual({ type: 'srt', text: SRT, audioRef: AUDIO });
    await getTranscript(env, EP, f);
    expect(calls()).toBe(1);
    expect(await env.FILES.get(`transcripts/${EP}.srt`)).not.toBeNull();
  });

  it('404 sans transcription, 502 si le fichier n’est pas un SRT/VTT', async () => {
    const { getTranscript } = await import('../src/routes/transcripts');
    expect((await getTranscript(env, EP)).status).toBe(404);
    await env.DB.prepare("UPDATE episodes SET transcript_url = 'https://cdn.example.com/x.srt', transcript_type = 'srt'").run();
    await expect(getTranscript(env, EP, fetcherFor('<html>nope</html>').f)).rejects.toThrow(/SRT ou un VTT/);
  });
});
