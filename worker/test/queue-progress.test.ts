import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ATELIER_TOKEN, call, login } from './helpers';
import { plannedStages, progressOf } from '../src/queue/progress';
import type { QueueRow } from '../src/queue/store';

const EP = 'b'.repeat(20);
const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const atelier = (path: string, body: unknown) => call('/atelier/queue' + path, { method: 'POST', body, headers });
let cookie: string;
beforeEach(async () => {
  await env.DB.batch(['DELETE FROM prepare_queue', 'DELETE FROM queue_stage_log', 'DELETE FROM episodes', 'DELETE FROM shows', 'DELETE FROM sessions', 'DELETE FROM login_attempts', "DELETE FROM app_settings WHERE key='atelier_seen_at'"]
    .map((s) => env.DB.prepare(s)));
  await env.DB.prepare("INSERT INTO shows (id,title,feed_url,language,category,next_check_at,created_at) VALUES ('show','Show','https://example.com/rss','fr','news','2026-01-01','2026-01-01')").run();
  await env.DB.prepare("INSERT INTO episodes (id,show_id,guid,title,audio_url,duration_sec,created_at) VALUES (?,'show','ep','Épisode','https://example.com/audio.mp3',3000,'2026-01-01')").bind(EP).run();
  cookie = await login();
});

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: 'x', kind: 'episode', ref: EP, options_json: '{"faithful":false}', status: 'leased', stage: 'adapt', lease_token: 't', lease_owner: 'mac',
  lease_expires_at: null, attempts: 1, max_attempts: 3, content_id: null, error: null, created_at: '', updated_at: '', executor: 'mac', ...over,
});

describe('avancement des préparations', () => {
  it('prévoit les étapes selon la source, la version fidèle et l’exécutant', () => {
    expect(plannedStages(row())).toEqual(['download', 'normalize', 'transcribe', 'plan', 'extract', 'adapt', 'evaluate', 'tts', 'publish']);
    expect(plannedStages(row({ options_json: '{"faithful":true}' }))).toContain('translate');
    expect(plannedStages(row({ kind: 'reflection' }))[0]).toBe('download');
    expect(plannedStages(row({ kind: 'reflection' }))).not.toContain('transcribe');
    expect(plannedStages(row({ executor: 'cloud' }))).toEqual(['transcribe', 'adapt', 'evaluate', 'tts', 'publish']);
  });
  it('calcule pourcentage et temps restant, sans dépasser 99 % quand une étape s’allonge', () => {
    const now = Date.parse('2026-10-20T10:10:00Z');
    const p = progressOf({ ...row(), stage_started_at: '2026-10-20T10:09:00Z' }, new Map(), now)!;
    expect(p.current).toBe(5);
    expect(p.percent).toBeGreaterThan(40);
    expect(p.remainingSec).toBeGreaterThan(150 + 20);
    const late = progressOf({ ...row({ stage: 'publish' }), stage_started_at: '2026-10-20T09:00:00Z' }, new Map(), now)!;
    expect(late.percent).toBeLessThanOrEqual(99);
    expect(late.remainingSec).toBeGreaterThan(0);
    expect(progressOf(row({ status: 'pending' }), new Map(), now)).toBeNull();
  });
  it('journalise la durée réelle des étapes et la renvoie avec la file, avec le dernier contact de l’Atelier', async () => {
    await call(`/api/episodes/${EP}/prepare`, { method: 'POST', body: {}, cookie });
    const { item } = await (await atelier('/lease', { owner: 'mac' })).json<{ item: { id: string; leaseToken: string } }>();
    await env.DB.prepare("UPDATE prepare_queue SET stage_started_at='2026-10-20T10:00:00.000Z' WHERE id=?").bind(item.id).run();
    expect((await atelier(`/${item.id}/heartbeat`, { leaseToken: item.leaseToken, stage: 'transcribe' })).status).toBe(200);
    const log = await env.DB.prepare('SELECT stage, seconds FROM queue_stage_log').all<{ stage: string; seconds: number }>();
    expect(log.results).toHaveLength(1);
    expect(log.results[0]!.stage).toBe('download');
    expect(log.results[0]!.seconds).toBeGreaterThan(0);
    const list = await (await call('/api/queue', { cookie })).json<{ items: { progress: { stages: string[]; current: number; history: boolean } | null }[]; atelierSeenAt: string | null }>();
    expect(list.items[0]!.progress).toMatchObject({ current: 2, history: true });
    expect(list.atelierSeenAt).not.toBeNull();
  });
});

describe('place dans la file du Mac', () => {
  it('donne la position, la demande qui passe avant et le délai avant le début', async () => {
    const { waitingOf } = await import('../src/queue/progress');
    const now = Date.parse('2026-10-20T10:10:00Z');
    const rows = [
      { ...row({ id: 'a', status: 'leased', stage: 'tts', title: 'En cours' }), stage_started_at: '2026-10-20T10:09:00Z' },
      row({ id: 'b', status: 'pending', stage: null, title: 'Deuxième' }),
      row({ id: 'c', status: 'pending', stage: 'review', title: 'À relire' }),
      row({ id: 'd', status: 'pending', stage: null, title: 'Troisième' }),
    ];
    const w = waitingOf(rows, new Map(), now);
    expect(w.get('b')).toMatchObject({ position: 2, ahead: 1, aheadTitle: 'En cours' });
    expect(w.get('b')!.startInSec).toBeGreaterThan(0);
    expect(w.has('c')).toBe(false);
    expect(w.get('d')!.position).toBe(3);
    expect(w.get('d')!.startInSec).toBeGreaterThan(w.get('b')!.startInSec);
  });
});
