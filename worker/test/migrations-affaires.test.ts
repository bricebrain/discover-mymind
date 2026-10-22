import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { setupExport, CONTENT_ID } from './export.fixture';

it('préserve les données, les liens enfants et les triggers pendant la migration des affaires', async () => {
  await setupExport();
  const publication = await env.DB.prepare('SELECT current_publication_id AS id FROM contents WHERE id=?').bind(CONTENT_ID).first<{ id: string }>();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO listening_reviews(content_id,publication_id,variant_key,step,due_at,created_at,updated_at)
    VALUES (?,?,?,1,?,?,?)`).bind(CONTENT_ID, publication!.id, 'en-full-b1', now, now, now).run();
  const tables = ['contents', 'episodes', 'reflections', 'prepare_queue', 'listening_reviews', 'quiz_answers'];
  const snapshots = new Map<string, unknown>();
  for (const table of tables) snapshots.set(table, (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results);
  const triggers = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
  const migration = migrations.find(m => m.name === '0033_affaires.sql')!;
  await applyD1Migrations(env.DB, [{ ...migration, name: 'reverification_affaires.sql' }]);
  for (const table of tables) expect((await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results, table).toEqual(snapshots.get(table));
  expect((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results).toEqual(triggers.results);
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
