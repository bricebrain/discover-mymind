import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, login } from './helpers';
import { weekKey } from '../src/weekly/week';
import { listeningStatement } from '../src/weekly/activity';

const EP = 'a1b2c3d4e5f6a7b8c9d0';
const ID = '12345678-1234-4234-8234-123456789abc';
const AT = '2026-10-19T10:00:00.000Z';
let cookie = '';
beforeEach(async () => {
  await env.DB.batch([
    ...['weekly_listening','weekly_articles','weekly_links','weekly_notes','weekly_publications','reflection_links','reflections',
      'episodes','contents','publications','articles','sessions','login_attempts'].map(t => env.DB.prepare(`DELETE FROM ${t}`)),
  ]);
  await env.DB.prepare(`INSERT OR IGNORE INTO shows (id,title,feed_url,language,category,next_check_at,created_at)
    VALUES ('weekly-show','Émission','https://weekly.test/feed','fr','news',?,?)`).bind(AT, AT).run();
  await env.DB.prepare(`INSERT INTO episodes (id,show_id,guid,title,audio_url,created_at)
    VALUES (?,'weekly-show','weekly-guid','Épisode de la semaine','https://weekly.test/audio',?)`).bind(EP, AT).run();
  cookie = await login();
});
async function note(at = AT, body = 'Texte de la semaine.', id = ID) {
  await env.DB.prepare(`INSERT INTO reflections (id,title,body_md,created_at,updated_at) VALUES (?,'Note',?,?,?)`)
    .bind(id, body, at, at).run();
}
const get = (week = '2026-W43', exportMd = false) => call(`/api/weekly${exportMd ? '/export' : ''}?week=${week}`, { cookie });
async function summary(week = '2026-W43') {
  const response = await get(week);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<{ metrics: Record<string, number>; previous: { metrics: Record<string, number> }; delta: Record<string, number>; learnedWords: unknown[] }>();
}

describe('bilan et export hebdomadaire I8', () => {
  it('exige une session et valide les semaines avant de lire la base', async () => {
    expect((await call('/api/weekly')).status).toBe(401);
    expect((await call('/api/weekly/export')).status).toBe(401);
    expect((await get('2025-W53')).status).toBe(400);
    expect((await get('wrong', true)).status).toBe(400);
    expect((await call('/api/weekly', { cookie })).status).toBe(200);
    expect((await get('2000-W01')).status).toBe(200);
  });
  it('rend une semaine vide et un Markdown stable', async () => {
    const result = await summary();
    expect(Object.values(result.metrics)).toEqual(Array(8).fill(0));
    expect(result.learnedWords).toEqual([]);
    const md = await get('2026-W43', true);
    expect(md.headers.get('Content-Type')).toContain('text/markdown');
    expect(md.headers.get('Content-Disposition')).toContain('discover-weekly-2026-W43.md');
    expect(await md.text()).toMatchSnapshot();
  });
  it('garde une photo par note et par heure malgré l’enregistrement automatique', async () => {
    await note();
    const stmt = env.DB.prepare('UPDATE reflections SET body_md=?,updated_at=? WHERE id=?');
    await env.DB.batch(Array.from({ length: 600 }, (_, i) =>
      stmt.bind(`Version ${i}`, new Date(Date.parse(AT) + (i + 1) * 1200).toISOString(), ID)));
    const rows = await env.DB.prepare('SELECT count(*) AS n FROM weekly_notes WHERE note_id=?').bind(ID).first<{ n: number }>();
    expect(rows?.n).toBe(1);
    expect((await summary()).metrics).toMatchObject({ notesCreated: 1, notesModified: 1 });
    expect(await (await get('2026-W43', true)).text()).toContain('Version 599');
  });
  it('compte les notes créées/modifiées, exclut la corbeille et conserve la bonne révision', async () => {
    await note();
    await note('2026-10-19T11:00:00.000Z', 'CORBEILLE', 'trash');
    await env.DB.prepare("UPDATE reflections SET deleted_at=? WHERE id='trash'").bind(AT).run();
    await env.DB.prepare('UPDATE reflections SET body_md=?,updated_at=? WHERE id=?')
      .bind('Texte modifié cette semaine.', '2026-10-25T22:59:59.999Z', ID).run();
    await env.DB.prepare('UPDATE reflections SET body_md=?,updated_at=? WHERE id=?')
      .bind('SECRET SEMAINE SUIVANTE', '2026-10-25T23:00:00.000Z', ID).run();
    expect((await summary()).metrics).toMatchObject({ notesCreated: 1, notesModified: 1 });
    const md = await (await get('2026-W43', true)).text();
    expect(md).toContain('Texte modifié cette semaine.');
    expect(md).not.toContain('SECRET SEMAINE SUIVANTE');
    expect(md).not.toContain('CORBEILLE');
    expect((await summary('2026-W44')).metrics).toMatchObject({ notesCreated: 0, notesModified: 1 });
  });
  it('respecte les bornes exactes, les liens datés et la comparaison précédente', async () => {
    await note('2026-10-18T21:59:59.999Z', 'PRÉCÉDENTE', 'previous');
    await note('2026-10-18T22:00:00.000Z');
    await note('2026-10-25T23:00:00.000Z', 'SUIVANTE', 'next');
    await env.DB.prepare(`INSERT INTO reflection_links (reflection_id,target_type,target_id,quote,target_title,created_at)
      VALUES (?,'episode',?,'Citation retenue','Épisode',?)`).bind(ID, EP, AT).run();
    const result = await summary();
    expect(result.metrics).toMatchObject({ notesCreated: 1, linkedPassages: 1 });
    expect(result.previous.metrics.notesCreated).toBe(1);
    expect(result.delta.notesCreated).toBe(0);
    const md = await (await get('2026-W43', true)).text();
    expect(md).toContain('Citation retenue');
    expect(md).toContain('[Épisode](<https://weekly.test/audio>)');
    expect(md).not.toContain('PRÉCÉDENTE');
    expect(md).not.toContain('SUIVANTE');
  });
  it('préserve les citations historiques après remplacement des liens la semaine suivante', async () => {
    await note();
    const insert = (quote: string, at: string) => env.DB.prepare(`INSERT INTO reflection_links
      (reflection_id,target_type,target_id,quote,target_title,created_at) VALUES (?,'episode',?,?,'Épisode',?)`)
      .bind(ID, EP, quote, at).run();
    await insert('Citation de la semaine', AT);
    await env.DB.prepare('DELETE FROM reflection_links WHERE reflection_id=?').bind(ID).run();
    await insert('CITATION FUTURE', '2026-10-26T12:00:00.000Z');
    expect((await summary()).metrics.linkedPassages).toBe(1);
    const md = await (await get('2026-W43', true)).text();
    expect(md).toContain('Citation de la semaine');
    expect(md).not.toContain('CITATION FUTURE');
    await env.DB.prepare('UPDATE reflections SET deleted_at=? WHERE id=?').bind(AT, ID).run();
    expect((await summary()).metrics.linkedPassages).toBe(0);
  });
  it('cumule les deltas atomiquement, ignore doublons/recul et ne répète pas la fin la semaine suivante', async () => {
    await env.DB.prepare('DELETE FROM listening_progress').run();
    const put = (positionMs: number, completed = false, audioRef = 'audio') => call('/api/progress', {
      method: 'PUT', cookie, body: { targetType: 'episode', targetId: EP, audioRef, positionMs, completed },
    });
    await put(60000); await put(60000); await put(30000); await put(90000, true); await put(90000, true);
    const currentWeek = weekKey();
    expect((await summary(currentWeek)).metrics).toMatchObject({ listenedMinutes: 2, completedContents: 1 });
    const next = listeningStatement(env, 'episode', EP, 'audio', 120000, 1, new Date('2027-01-04T10:00:00.000Z'));
    await next.run();
    expect((await summary('2027-W01')).metrics).toMatchObject({ listenedMinutes: 0.5, completedContents: 0 });
    await put(30000, false, 'new-audio');
    expect((await summary(currentWeek)).metrics.listenedMinutes).toBe(2.5);
  });
  it('annule aussi le compteur hebdomadaire si la sauvegarde de progression échoue', async () => {
    const at = new Date('2026-10-19T12:00:00.000Z');
    await expect(env.DB.batch([
      listeningStatement(env, 'variant', 'rollback-content:en-b1', 'audio', 60000, 0, at),
      env.DB.prepare(`INSERT INTO listening_progress (target_type,target_id,audio_ref,position_ms,completed,updated_at)
        VALUES ('invalid','rollback','audio',60000,0,?)`).bind(at.toISOString()),
    ])).rejects.toThrow();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM weekly_listening WHERE target_id='rollback-content:en-b1'").first('n')).toBe(0);
  });
  it('enregistre lectures et sauvegardes article sans doublon', async () => {
    await env.DB.prepare(`INSERT INTO articles (id,source_id,guid,url,title,content_text,created_at)
      VALUES (?,'guardian-world','weekly-article','https://weekly.test/article','Article hebdomadaire',?,?)`)
      .bind(EP, 'Un article suffisamment long pour devenir une note personnelle.', AT).run();
    for (let i = 0; i < 2; i++) {
      expect((await call(`/api/articles/${EP}`, { cookie })).status).toBe(200);
      expect((await call(`/api/articles/${EP}/note`, { method: 'POST', cookie, body: {} })).status).toBe(201);
    }
    expect((await summary(weekKey())).metrics).toMatchObject({ articlesRead: 1, articlesSaved: 1 });
  });
  it('compte une publication à son passage ready, même après remplacement et nettoyage', async () => {
    await env.DB.prepare(`INSERT INTO contents (id,title,original_language,source_type,created_at,updated_at)
      VALUES ('weekly-content','Préparation','fr','reflection',?,?)`).bind(AT, AT).run();
    await env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,created_at,updated_at)
      VALUES ('weekly-pub','weekly-content','rev',1,'uploading','unused',?,?)`).bind(AT, AT).run();
    await env.DB.prepare("UPDATE publications SET status='ready',updated_at=? WHERE id='weekly-pub'").bind(AT).run();
    await env.DB.prepare("UPDATE publications SET status='superseded',updated_at=? WHERE id='weekly-pub'").bind('2026-10-26T12:00:00.000Z').run();
    await env.DB.prepare("DELETE FROM publications WHERE id='weekly-pub'").run();
    expect((await summary()).metrics.publishedPreparations).toBe(1);
    expect((await summary('2026-W44')).metrics.publishedPreparations).toBe(0);
  });
  it('exporte seulement les champs autorisés et les sources des activités sélectionnées', async () => {
    await note();
    await env.DB.prepare(`INSERT INTO weekly_listening VALUES ('2026-W43','episode',?,60000,1)`).bind(EP).run();
    await env.DB.prepare(`INSERT INTO weekly_listening VALUES ('2026-W42','episode','OLD_SECRET',60000,1)`).run();
    await env.DB.prepare(`INSERT INTO app_settings (key,value) VALUES ('weekly-secret','NEVER_EXPORT')`).run();
    const md = await (await get('2026-W43', true)).text();
    expect(md).toContain('[Épisode de la semaine](<https://weekly.test/audio>)');
    expect(md).not.toMatch(/OLD_SECRET|NEVER_EXPORT|test-passphrase|test-atelier-token|session-secret/);
    expect(md).toMatchSnapshot();
  });
  it('refuse un dépassement sans servir de résultat partiel', async () => {
    await env.DB.batch(Array.from({ length: 201 }, (_, i) => env.DB.prepare(`INSERT INTO weekly_listening
      VALUES ('2026-W43','variant',?,1,0)`).bind(`content-${i}:en-b1`)));
    expect((await get()).status).toBe(422);
    expect((await get('2026-W43', true)).status).toBe(422);
  });
});
