import { env } from 'cloudflare:workers';
import { expect, it, vi } from 'vitest';
import { library } from '../src/routes/contents';
import { call, login } from './helpers';

it('calcule les badges en une requête D1 depuis la préparation courante et toutes les dictées du contenu', async () => {
  const cases = [
    { id: 'both', guided: true, dictated: true },
    { id: 'guided', guided: true, dictated: false },
    { id: 'dictated', guided: false, dictated: true },
    { id: 'neither', guided: false, dictated: false },
    { id: 'no-queue', guided: false, dictated: false },
    { id: 'missing-queue', guided: false, dictated: false },
  ];
  for (const c of cases) {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO contents (id,title,original_language,source_type,created_at,updated_at)
        VALUES (?,?,'en','youtube','2026-10-22','2026-10-22')`).bind(c.id,c.id),
      env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,queue_item_id,created_at,updated_at)
        VALUES (?,?,'current',2,'ready','absent-from-r2',?,'2026-10-22','2026-10-22')`)
        .bind(`pub-${c.id}`,c.id,c.id==='no-queue' ? null : `queue-${c.id}`),
      env.DB.prepare('UPDATE contents SET current_publication_id=? WHERE id=?').bind(`pub-${c.id}`,c.id),
    ]);
    if (!c.id.endsWith('queue')) {
      await env.DB.prepare(`INSERT INTO prepare_queue (id,kind,ref,options_json,status,content_id,created_at,updated_at)
        VALUES (?,'youtube',?,?,'done',?,'2026-10-22','2026-10-22')`)
        .bind(`queue-${c.id}`,c.id,JSON.stringify({ coverage: c.guided ? 'guided' : 'full' }),c.id).run();
    }
    // Une ancienne publication et une nouvelle demande guidées ne qualifient pas la publication courante.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO prepare_queue (id,kind,ref,options_json,status,content_id,created_at,updated_at)
        VALUES (?,'youtube',?,'{"coverage":"guided"}','pending',?,'2026-10-22','2026-10-22')`)
        .bind(`other-${c.id}`,c.id,c.id),
      env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,queue_item_id,created_at,updated_at)
        VALUES (?,?,'old',1,'superseded','absent',?,'2026-10-21','2026-10-21')`)
        .bind(`old-${c.id}`,c.id,`other-${c.id}`),
    ]);
    if (c.dictated) {
      for (let i=0;i<2;i++) await env.DB.prepare(`INSERT INTO dictation_attempts
        (id,content_id,publication_id,variant_key,segment_id,voice,expected,typed,expected_words,correct_words,errors_json,created_at)
        VALUES (?,?,?,'source','s1','original','Hello','',1,0,'[]','2026-10-21')`)
        .bind(`${c.id}-${i}`,c.id,`old-${c.id}`).run();
    }
  }
  const prepare = vi.fn((sql: string) => env.DB.prepare(sql));
  const guardedEnv = { ...env,
    DB: new Proxy(env.DB, { get: (db, key) => key==='prepare' ? prepare : Reflect.get(db,key) }),
    FILES: new Proxy(env.FILES, { get: () => { throw new Error('R2 interdit pour la bibliothèque'); } }),
  };
  const response = await library(new Request('https://discover.test/api/library'),guardedEnv);
  const data = await response.json<{ contents: { id: string; guided: boolean; dictated: boolean }[]; total: number }>();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(data.total).toBe(cases.length);
  expect(data.contents).toHaveLength(cases.length);
  for (const c of cases) expect(data.contents.find((row) => row.id===c.id)).toMatchObject(c);
  const http = await call('/api/library', { cookie: await login() });
  expect(await http.json()).toEqual(data);
});
