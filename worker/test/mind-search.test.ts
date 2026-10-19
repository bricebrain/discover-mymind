import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { purgeTrash } from '../src/routes/reflections';
import { ATELIER_TOKEN, call, login } from './helpers';

let cookie = '';
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM reflections').run();
  cookie = await login();
});
interface Note { id: string; updatedAt: string; questionState: string | null; body: string }
interface Page { reflections: (Note & { highlights: { text: string; highlighted: boolean }[] })[]; nextCursor: string | null }
async function create(extra: Record<string, unknown> = {}) {
  const response = await call('/api/reflections', { method: 'POST', cookie, body: { id: crypto.randomUUID(), body: 'Texte', ...extra } });
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json<{ reflection: Note }>()).reflection;
}
const search = async (q: string, suffix = '') => {
  const response = await call(`/api/reflections/search?q=${encodeURIComponent(q)}${suffix}`, { cookie });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<Page>();
};

it('cherche le corps complet et le titre, sans accents, et fournit des fragments surlignés sans HTML', async () => {
  const note = await create({ title: '<img src=x> Dette', body: 'Préambule. '.repeat(100) + 'Économie quantique <script>alerte</script>.' });
  const page = await search('economie quantique');
  expect(page.reflections.map((r) => r.id)).toEqual([note.id]);
  expect(page.reflections[0]!.highlights).toContainEqual({ text: 'Économie', highlighted: true });
  expect((await search('dette')).reflections[0]!.id).toBe(note.id);
  expect((await search('inexistant')).reflections).toEqual([]);
});

it('maintient l’index après édition, corbeille, restauration et purge, sans doublon idempotent', async () => {
  const note = await create({ title: 'Ancientitre', body: 'Ancienmot' });
  await call('/api/reflections', { method: 'POST', cookie, body: { id: note.id, body: 'Doublon' } });
  expect(await env.DB.prepare("SELECT count(*) FROM search_index WHERE kind='reflection' AND ref_id=?").bind(note.id).first('count(*)')).toBe(1);
  await call(`/api/reflections/${note.id}`, { method: 'PATCH', cookie, body: { baseUpdatedAt: note.updatedAt, title: 'Nouveautitre', body: 'Nouveaumot' } });
  expect((await search('Ancienmot')).reflections).toHaveLength(0);
  expect((await search('Ancientitre')).reflections).toHaveLength(0);
  expect((await search('Nouveaumot')).reflections).toHaveLength(1);
  await call(`/api/reflections/${note.id}`, { method: 'DELETE', cookie });
  expect((await search('Nouveaumot', '&trash=1')).reflections).toHaveLength(0);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM search_index WHERE ref_id=?').bind(note.id).first('n')).toBe(0);
  await call(`/api/reflections/${note.id}/restore`, { method: 'POST', cookie, body: {} });
  expect((await search('Nouveautitre')).reflections).toHaveLength(1);
  await call(`/api/reflections/${note.id}`, { method: 'DELETE', cookie });
  expect(await purgeTrash(env, Date.now() + 31 * 86400_000)).toBe(1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM search_index WHERE ref_id=?').bind(note.id).first('n')).toBe(0);
});

it('pagine avec dates identiques sans doublons et refuse un curseur réutilisé avec une autre requête', async () => {
  await env.DB.batch(Array.from({ length: 35 }, (_, index) => env.DB.prepare(
    'INSERT INTO reflections (id,title,body_md,created_at,updated_at) VALUES (?,?,?,?,?)',
  ).bind(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, 'Pagination', 'Dans le corps', '2026-10-19T00:00:00.000Z', '2026-10-19T00:00:00.000Z')));
  const first = await search('pagination');
  expect(first.reflections).toHaveLength(30);
  expect(first.nextCursor).toBeTypeOf('string');
  const second = await search('pagination', `&cursor=${encodeURIComponent(first.nextCursor!)}`);
  expect(second.reflections).toHaveLength(5);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.reflections, ...second.reflections].map((r) => r.id)).size).toBe(35);
  expect((await call(`/api/reflections/search?q=autre&cursor=${encodeURIComponent(first.nextCursor!)}`, { cookie })).status).toBe(400);
});

it('modifie et efface questionState, filtre exactement les tags, types, origines et états', async () => {
  const question = await create({ kind: 'question', questionState: 'to_explore', tags: ['économie', 'taux'], origin: 'article' });
  await create({ kind: 'idea', tags: ['macroéconomie'], origin: 'personal' });
  const suffix = 'kind=question&tag=%C3%A9conomie&origin=article&question_state=to_explore';
  for (const path of [`/api/reflections?${suffix}`, `/api/reflections/search?q=texte&${suffix}`]) {
    const page = await (await call(path, { cookie })).json<Page>();
    expect(page.reflections.map((r) => r.id)).toEqual([question.id]);
    expect(page.reflections[0]!.questionState).toBe('to_explore');
  }
  let base = question;
  for (const state of ['thinking', 'deepened', null]) {
    const response = await call(`/api/reflections/${base.id}`, { method: 'PATCH', cookie, body: { baseUpdatedAt: base.updatedAt, questionState: state } });
    expect(response.status).toBe(200);
    base = (await response.json<{ reflection: Note }>()).reflection;
    expect(base.questionState).toBe(state);
  }
  expect((await call(`/api/reflections/${base.id}`, { method: 'PATCH', cookie, body: { baseUpdatedAt: base.updatedAt, questionState: 'done' } })).status).toBe(400);
  expect((await call('/api/reflections', { method: 'POST', cookie, body: { id: crypto.randomUUID(), body: '', questionState: 42 } })).status).toBe(400);
});

it('refuse filtres, recherches et curseurs invalides avec 400, sans exposer la grammaire FTS', async () => {
  for (const suffix of ['kind=x', 'tag=', 'origin=blog', 'question_state=done']) {
    expect((await call(`/api/reflections?${suffix}`, { cookie })).status).toBe(400);
  }
  for (const suffix of ['q=', 'q=%22*()', `q=${'a'.repeat(201)}`, 'q=mot&cursor=!!!']) {
    expect((await call(`/api/reflections/search?${suffix}`, { cookie })).status).toBe(400);
  }
  await create({ body: 'title OR near' });
  expect((await search('title OR near')).reflections).toHaveLength(1);
  expect((await call('/api/reflections/search?q=texte')).status).toBe(401);
});

it('indexe une note issue d’Articles puis le texte récupéré par l’Atelier', async () => {
  const articleId = 'a'.repeat(20);
  await env.DB.prepare(`INSERT INTO articles (id,source_id,guid,url,title,summary,content_text,content_status,published_at,created_at)
    VALUES (?,'guardian-world','a2-search-guid','https://www.theguardian.com/a2','Titrearticle','Résumé article suffisamment long.',
    'Corpsarticle pour la recherche serveur.','complete','2026-10-19T00:00:00Z','2026-10-19T00:00:00Z')`).bind(articleId).run();
  const response = await call(`/api/articles/${articleId}/note`, { method: 'POST', cookie, body: {} });
  expect(response.status, await response.clone().text()).toBe(201);
  expect((await search('corpsarticle')).reflections).toHaveLength(1);
  const note = await create({ body: '', origin: 'article', sourceUrl: 'https://www.theguardian.com/a2-fetch' });
  await call(`/api/reflections/${note.id}/fetch`, { method: 'POST', cookie, body: {} });
  const fetched = await call(`/atelier/article-fetches/${note.id}`, { method: 'POST', headers: { Authorization: `Bearer ${ATELIER_TOKEN}` }, body: { status: 'complete', text: 'Récupérationatelier dans le corps.' } });
  expect(fetched.status).toBe(200);
  expect((await search('recuperationatelier')).reflections.map((r) => r.id)).toEqual([note.id]);
});

it('la migration reconstruit les notes actives, retire les entrées obsolètes et conserve les autres types', async () => {
  const migrations = (env as typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] }).TEST_MIGRATIONS;
  const migration = migrations.find((item) => item.name.startsWith('0019'));
  expect(migration).toBeDefined();
  await env.DB.batch([
    env.DB.prepare('DROP TRIGGER reflections_search_insert'),
    env.DB.prepare('DROP TRIGGER reflections_search_update'),
    env.DB.prepare('DROP TRIGGER reflections_search_delete'),
    env.DB.prepare('DROP INDEX reflections_mind_order'),
    env.DB.prepare('ALTER TABLE reflections DROP COLUMN mutation_token'),
  ]);
  const active = await create({ title: 'Ancienne note', body: 'Avantmigration' });
  const trashed = await create({ body: 'Corbeille' });
  await call(`/api/reflections/${trashed.id}`, { method: 'DELETE', cookie });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO search_index(kind,ref_id,title,body) VALUES ('reflection',?,'Faux titre','Obsolète')").bind(trashed.id),
    env.DB.prepare("INSERT INTO search_index(kind,ref_id,title,body) VALUES ('article','external-article','Article','Conservé')"),
  ]);
  await env.DB.batch(migration!.queries.map((query) => env.DB.prepare(query)));
  expect((await search('avantmigration')).reflections.map((r) => r.id)).toEqual([active.id]);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM search_index WHERE kind='reflection'").first('n')).toBe(1);
  expect(await env.DB.prepare("SELECT body FROM search_index WHERE kind='article' AND ref_id='external-article'").first('body')).toBe('Conservé');
  await create({ body: 'Aprèsmigration' });
  expect((await search('apresmigration')).reflections).toHaveLength(1);
});
