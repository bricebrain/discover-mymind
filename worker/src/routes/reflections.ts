import type { Env } from '../env';
import { apiError, json, noContent, readJson } from '../http';
import { MAX_BODY, TRASH_RETENTION_MS, validId, text, kind, origin, sourceUrl, sourceName, tags, questionState } from '../mind/validation';
import { linkStatements } from '../mind/links';
export { KINDS, TRASH_RETENTION_MS, validId } from '../mind/validation';
export { list, search } from '../mind/search';

/**
 * My Mind (lot 4) : notes Markdown créées côté client (UUID), synchronisées avec un contrôle de
 * conflit (`baseUpdatedAt` → 409), corbeille de 30 jours, liens vers les épisodes.
 */
interface Row {
  id: string;
  title: string | null;
  body_md: string;
  kind: string;
  question_state: string | null;
  tags_json: string;
  english_content_id: string | null;
  origin: string;
  source_name: string | null;
  source_url: string | null;
  article_fetch: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LinkRow {
  target_type: string;
  target_id: string;
  variant_key: string;
  segment_id: string;
  quote: string | null;
  target_title: string;
}

function out(r: Row, links: LinkRow[] = []) {
  return {
    id: r.id, title: r.title, body: r.body_md, kind: r.kind, questionState: r.question_state,
    tags: JSON.parse(r.tags_json) as string[], englishContentId: r.english_content_id,
    origin: r.origin, sourceName: r.source_name, sourceUrl: r.source_url, articleFetch: r.article_fetch,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
    links: links.map((l) => ({
      targetType: l.target_type, targetId: l.target_id, variantKey: l.variant_key || null,
      segmentId: l.segment_id || null, quote: l.quote, targetTitle: l.target_title,
    })),
  };
}

async function load(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM reflections WHERE id = ?').bind(id).first<Row>();
  if (!row) return null;
  const { results } = await env.DB.prepare(
    'SELECT target_type, target_id, variant_key, segment_id, quote, target_title FROM reflection_links WHERE reflection_id = ? ORDER BY created_at',
  ).bind(id).all<LinkRow>();
  return out(row, results);
}

/** GET /api/reflections/:id */
export async function get(env: Env, id: string): Promise<Response> {
  const r = await load(env, validId(id));
  return r ? json({ reflection: r }) : apiError(404, 'not_found', 'Note inconnue.');
}

/** POST /api/reflections — création ; idempotente si la même note est renvoyée (synchronisation hors ligne). */
export async function create(req: Request, env: Env): Promise<Response> {
  const b = await readJson<Record<string, unknown>>(req, MAX_BODY + 20_000);
  const id = validId(String(b.id ?? ''));
  const existing = await load(env, id);
  if (existing) return json({ reflection: existing }, 200);

  const now = new Date().toISOString();
  const createdAt = typeof b.createdAt === 'string' && !Number.isNaN(Date.parse(b.createdAt)) && Date.parse(b.createdAt) <= Date.now() + 60_000
    ? new Date(b.createdAt).toISOString() : now;
  const stmts = [env.DB.prepare(
    `INSERT INTO reflections (id, title, body_md, kind, question_state, tags_json, origin, source_name, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, text(b.title, 'Titre', 200), text(b.body, 'Texte', MAX_BODY, false) ?? '', kind(b.kind), questionState(b.questionState), JSON.stringify(tags(b.tags)),
    origin(b.origin), sourceName(b.sourceName), sourceUrl(b.sourceUrl), createdAt, now)];
  stmts.push(...((await linkStatements(env, id, b.links, now)) ?? []).slice(1));
  await env.DB.batch(stmts);
  return json({ reflection: await load(env, id) }, 201);
}

/** PATCH /api/reflections/:id — { baseUpdatedAt, title?, body?, kind?, questionState?, tags?, links? } ; 409 si modifiée ailleurs. */
export async function update(req: Request, env: Env, rawId: string): Promise<Response> {
  const id = validId(rawId);
  const b = await readJson<Record<string, unknown>>(req, MAX_BODY + 20_000);
  const current = await load(env, id);
  if (!current) return apiError(404, 'not_found', 'Note inconnue.');
  if (current.deletedAt) return apiError(409, 'deleted', 'Cette note est dans la corbeille.');
  if (typeof b.baseUpdatedAt !== 'string' || b.baseUpdatedAt !== current.updatedAt) {
    return json({ error: { code: 'conflict', message: 'La note a été modifiée ailleurs.' }, current }, 409);
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if ('title' in b) { sets.push('title = ?'); values.push(text(b.title, 'Titre', 200)); }
  if ('body' in b) { sets.push('body_md = ?'); values.push(text(b.body, 'Texte', MAX_BODY, false)); }
  if ('kind' in b) { sets.push('kind = ?'); values.push(kind(b.kind)); }
  if ('questionState' in b) { sets.push('question_state = ?'); values.push(questionState(b.questionState)); }
  if ('tags' in b) { sets.push('tags_json = ?'); values.push(JSON.stringify(tags(b.tags))); }
  if ('origin' in b) { sets.push('origin = ?'); values.push(origin(b.origin)); }
  if ('sourceName' in b) { sets.push('source_name = ?'); values.push(sourceName(b.sourceName)); }
  if ('sourceUrl' in b) { sets.push('source_url = ?'); values.push(sourceUrl(b.sourceUrl)); }
  const now = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
  const mutationToken = crypto.randomUUID();
  const linkStmts = await linkStatements(env, id, b.links, now, mutationToken);
  // Compare-and-swap : la mise à jour n'a lieu que si personne n'a écrit entre-temps.
  const stmt = env.DB.prepare(`UPDATE reflections SET ${[...sets, 'updated_at = ?', 'mutation_token = ?'].join(', ')} WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`)
    .bind(...values, now, mutationToken, id, current.updatedAt);
  const results = await env.DB.batch([stmt, ...(linkStmts ?? [])]);
  if (!results[0]?.meta.changes) return json({ error: { code: 'conflict', message: 'La note a été modifiée ailleurs.' }, current: await load(env, id) }, 409);
  return json({ reflection: await load(env, id) });
}

/** DELETE /api/reflections/:id — corbeille (suppression définitive après 30 jours). */
export async function trash(env: Env, rawId: string): Promise<Response> {
  const id = validId(rawId);
  const now = new Date().toISOString();
  const r = await env.DB.prepare('UPDATE reflections SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, id).run();
  return r.meta.changes ? noContent() : apiError(404, 'not_found', 'Note inconnue.');
}

/** POST /api/reflections/:id/restore */
export async function restore(env: Env, rawId: string): Promise<Response> {
  const id = validId(rawId);
  const r = await env.DB.prepare('UPDATE reflections SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL')
    .bind(new Date().toISOString(), id).run();
  return r.meta.changes ? json({ reflection: await load(env, id) }) : apiError(404, 'not_found', 'Note introuvable dans la corbeille.');
}

/** Cron : purge des notes en corbeille depuis plus de 30 jours (par petits lots). */
export async function purgeTrash(env: Env, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare(
    'DELETE FROM reflections WHERE id IN (SELECT id FROM reflections WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 50) RETURNING id',
  ).bind(new Date(now - TRASH_RETENTION_MS).toISOString()).all<{ id: string }>();
  return r.results.length;
}

/** GET /api/export — notes (JSON + Markdown), liens, émissions, épisodes sauvegardés. */
export async function exportAll(env: Env): Promise<Response> {
  const [refl, links, shows, saved] = await Promise.all([
    env.DB.prepare('SELECT * FROM reflections WHERE deleted_at IS NULL ORDER BY created_at').all<Row>(),
    env.DB.prepare('SELECT reflection_id, target_type, target_id, variant_key, segment_id, quote, target_title FROM reflection_links').all<LinkRow & { reflection_id: string }>(),
    env.DB.prepare('SELECT id, title, publisher, feed_url, language, category, title_filter_json, enabled FROM shows ORDER BY id').all(),
    env.DB.prepare(`SELECT e.id, e.title, e.audio_url, e.published_at, s.title AS show FROM episodes e JOIN shows s ON s.id = e.show_id WHERE e.state = 'saved'`).all(),
  ]);
  const byNote = new Map<string, LinkRow[]>();
  for (const l of links.results) byNote.set(l.reflection_id, [...(byNote.get(l.reflection_id) ?? []), l]);
  const reflections = refl.results.map((r) => out(r, byNote.get(r.id) ?? []));
  const markdown = reflections.map((r) => [
    `# ${r.title || 'Sans titre'}`, '',
    `_${r.kind} · créée le ${r.createdAt.slice(0, 10)} · modifiée le ${r.updatedAt.slice(0, 10)}${r.tags.length ? ` · ${r.tags.map((t) => `#${t}`).join(' ')}` : ''}_`, '',
    ...(r.origin === 'article' ? [`Article${r.sourceName ? ` · ${r.sourceName}` : ''}${r.sourceUrl ? ` · ${r.sourceUrl}` : ''}`, ''] : []),
    r.body, ...(r.links.length ? ['', '**Sources :**', ...r.links.map((l) => `- ${l.targetTitle}${l.quote ? ` — « ${l.quote} »` : ''}`)] : []),
  ].join('\n')).join('\n\n---\n\n');
  const date = new Date().toISOString().slice(0, 10);
  return json(
    { schemaVersion: 1, exportedAt: new Date().toISOString(), reflections, markdown, shows: shows.results, savedEpisodes: saved.results },
    200,
    { 'Content-Disposition': `attachment; filename="discover-export-${date}.json"` },
  );
}
