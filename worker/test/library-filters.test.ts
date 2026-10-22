import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { call, login } from './helpers';

it('filtre par type et titre avant pagination, avec un total exact et sans publication invisible', async () => {
  const rows = Array.from({ length: 35 }, (_, i) => ({
    id: `content-${i}`, type: i < 31 ? 'youtube' : i === 31 ? 'podcast' : 'reflection',
    title: i === 5 ? 'Focus 100%_fiable' : `Focus ${i}`, deleted: i === 33, status: i === 34 ? 'uploading' : 'ready',
  }));
  for (const row of rows) {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO contents (id,title,original_language,source_type,created_at,updated_at,deleted_at)
        VALUES (?,?,'en',?,'2026-10-18','2026-10-18',?)`).bind(row.id,row.title,row.type,row.deleted ? '2026-10-18' : null),
      env.DB.prepare(`INSERT INTO publications (id,content_id,revision,seq,status,manifest_r2_key,created_at,updated_at)
        VALUES (?,?,?,1,?,'unused','2026-10-18','2026-10-18')`).bind(`pub-${row.id}`,row.id,row.id,row.status),
      env.DB.prepare('UPDATE contents SET current_publication_id=? WHERE id=?').bind(`pub-${row.id}`,row.id),
    ]);
  }
  const cookie = await login();
  const read = async (params: string) => (await call(`/api/library?${params}`, { cookie }))
    .json<{ contents: { id: string; sourceType: string }[]; total: number; nextOffset: number | null }>();
  expect((await read('')).total).toBe(33);
  const first = await read('type=youtube&q=focus');
  expect(first.total).toBe(31);
  expect(first.contents).toHaveLength(30);
  expect(first.nextOffset).toBe(30);
  expect(first.contents.every((c) => c.sourceType === 'youtube')).toBe(true);
  const last = await read('type=youtube&q=focus&offset=30');
  expect(last.contents).toHaveLength(1);
  expect(last.nextOffset).toBeNull();
  expect(await read('type=youtube&offset=300')).toEqual({ contents: [], total: 31, nextOffset: null });
  expect(await read('q=aucun-résultat')).toEqual({ contents: [], total: 0, nextOffset: null });
  expect(first.contents.some((c) => c.id === last.contents[0]!.id)).toBe(false);
  expect((await read('type=reflection')).contents).toEqual([expect.objectContaining({ id: 'content-32' })]);
  expect((await read('q=%25_')).contents).toEqual([expect.objectContaining({ id: 'content-5' })]);
  expect((await read('type=podcast&q=introuvable')).total).toBe(0);
  for (const query of ['type=inconnu', 'offset=-1', `q=${'x'.repeat(201)}`]) {
    expect((await call(`/api/library?${query}`, { cookie })).status).toBe(400);
  }
});
