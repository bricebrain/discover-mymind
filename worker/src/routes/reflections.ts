import type { Env } from '../env';
import { apiError, HttpError, json, noContent, readJson } from '../http';

/**
 * My Mind (lot 4) : notes Markdown créées côté client (UUID), synchronisées avec un contrôle de
 * conflit (`baseUpdatedAt` → 409), corbeille de 30 jours, liens vers les épisodes.
 */
export const KINDS = ['idea', 'question', 'opinion', 'observation', 'synthesis'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_BODY = 100_000;
export const TRASH_RETENTION_MS = 30 * 86_400_000;

interface Row {
  id: string;
  title: string | null;
  body_md: string;
  kind: string;
  question_state: string | null;
  tags_json: string;
  english_content_id: string | null;
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

export function validId(id: string): string {
  if (!UUID.test(id)) throw new HttpError(400, 'invalid_id', 'Identifiant de note invalide (UUID attendu).');
  return id;
}

function text(v: unknown, name: string, max: number, nullable = true): string | null {
  if (v === undefined || v === null) {
    if (nullable) return null;
    throw new HttpError(400, 'invalid_body', `${name} attendu.`);
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'invalid_body', `${name} : texte de ${max} caractères au plus.`);
  return v;
}

function kind(v: unknown): string {
  if (v === undefined) return 'idea';
  if (typeof v !== 'string' || !(KINDS as readonly string[]).includes(v)) throw new HttpError(400, 'invalid_body', `Type attendu : ${KINDS.join(', ')}.`);
  return v;
}

function tags(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20 || v.some((t) => typeof t !== 'string' || t.trim() === '' || t.length > 40)) {
    throw new HttpError(400, 'invalid_body', 'Tags : 20 au plus, 40 caractères chacun.');
  }
  return [...new Set(v.map((t: string) => t.trim()))];
}

function out(r: Row, links: LinkRow[] = []) {
  return {
    id: r.id, title: r.title, body: r.body_md, kind: r.kind, questionState: r.question_state,
    tags: JSON.parse(r.tags_json) as string[], englishContentId: r.english_content_id,
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

/** GET /api/reflections?trash=1 */
export async function list(req: Request, env: Env): Promise<Response> {
  const trash = new URL(req.url).searchParams.get('trash') === '1';
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.title, substr(r.body_md, 1, 280) AS excerpt, r.kind, r.tags_json, r.created_at, r.updated_at, r.deleted_at,
            (SELECT target_title FROM reflection_links l WHERE l.reflection_id = r.id ORDER BY l.created_at LIMIT 1) AS firstLinkTitle,
            (SELECT COUNT(*) FROM reflection_links l WHERE l.reflection_id = r.id) AS linkCount
       FROM reflections r WHERE r.deleted_at IS ${trash ? 'NOT ' : ''}NULL ORDER BY r.updated_at DESC LIMIT 500`,
  ).all<Record<string, unknown> & { tags_json: string; created_at: string; updated_at: string; deleted_at: string | null }>();
  return json({
    reflections: results.map(({ tags_json, created_at, updated_at, deleted_at, ...r }) => ({
      ...r, tags: JSON.parse(tags_json) as string[], createdAt: created_at, updatedAt: updated_at, deletedAt: deleted_at,
    })),
  });
}

/** GET /api/reflections/:id */
export async function get(env: Env, id: string): Promise<Response> {
  const r = await load(env, validId(id));
  return r ? json({ reflection: r }) : apiError(404, 'not_found', 'Note inconnue.');
}

/** Titre lisible d'une cible, gardé dans le lien (§ 4 : le lien reste lisible si la cible disparaît). */
async function targetTitle(env: Env, type: string, id: string): Promise<string | null> {
  if (type === 'episode') {
    const e = await env.DB.prepare('SELECT e.title, s.title AS show FROM episodes e JOIN shows s ON s.id = e.show_id WHERE e.id = ?')
      .bind(id).first<{ title: string; show: string }>();
    return e ? `${e.title} — ${e.show}` : null;
  }
  const c = await env.DB.prepare('SELECT title FROM contents WHERE id = ?').bind(id).first<{ title: string }>();
  return c?.title ?? null;
}

interface LinkInput { targetType?: unknown; targetId?: unknown; variantKey?: unknown; segmentId?: unknown; quote?: unknown }

async function linkStatements(env: Env, reflectionId: string, links: unknown, now: string) {
  if (links === undefined) return null;
  if (!Array.isArray(links) || links.length > 20) throw new HttpError(400, 'invalid_body', 'Liens : 20 au plus.');
  const stmts = [env.DB.prepare('DELETE FROM reflection_links WHERE reflection_id = ?').bind(reflectionId)];
  for (const l of links as LinkInput[]) {
    if ((l.targetType !== 'episode' && l.targetType !== 'content') || typeof l.targetId !== 'string' || !/^[a-z0-9-]{3,96}$/.test(l.targetId)) {
      throw new HttpError(400, 'invalid_body', 'Lien invalide.');
    }
    const title = await targetTitle(env, l.targetType, l.targetId);
    if (!title) throw new HttpError(422, 'unknown_target', 'La cible du lien n’existe pas.');
    stmts.push(env.DB.prepare(
      `INSERT OR REPLACE INTO reflection_links (reflection_id, target_type, target_id, variant_key, segment_id, quote, target_title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(reflectionId, l.targetType, l.targetId, text(l.variantKey, 'variantKey', 32) ?? '', text(l.segmentId, 'segmentId', 16) ?? '',
      text(l.quote, 'quote', 500), title, now));
  }
  return stmts;
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
    `INSERT INTO reflections (id, title, body_md, kind, tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, text(b.title, 'Titre', 200), text(b.body, 'Texte', MAX_BODY, false) ?? '', kind(b.kind), JSON.stringify(tags(b.tags)), createdAt, now)];
  stmts.push(...((await linkStatements(env, id, b.links, now)) ?? []).slice(1));
  await env.DB.batch(stmts);
  return json({ reflection: await load(env, id) }, 201);
}

/** PATCH /api/reflections/:id — { baseUpdatedAt, title?, body?, kind?, tags?, links? } ; 409 si modifiée ailleurs. */
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
  if ('tags' in b) { sets.push('tags_json = ?'); values.push(JSON.stringify(tags(b.tags))); }
  const now = new Date().toISOString();
  const linkStmts = await linkStatements(env, id, b.links, now);
  // Compare-and-swap : la mise à jour n'a lieu que si personne n'a écrit entre-temps.
  const stmt = env.DB.prepare(`UPDATE reflections SET ${[...sets, 'updated_at = ?'].join(', ')} WHERE id = ? AND updated_at = ?`)
    .bind(...values, now, id, current.updatedAt);
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
    'DELETE FROM reflections WHERE id IN (SELECT id FROM reflections WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 50)',
  ).bind(new Date(now - TRASH_RETENTION_MS).toISOString()).run();
  return r.meta.changes;
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
    r.body, ...(r.links.length ? ['', '**Sources :**', ...r.links.map((l) => `- ${l.targetTitle}${l.quote ? ` — « ${l.quote} »` : ''}`)] : []),
  ].join('\n')).join('\n\n---\n\n');
  const date = new Date().toISOString().slice(0, 10);
  return json(
    { schemaVersion: 1, exportedAt: new Date().toISOString(), reflections, markdown, shows: shows.results, savedEpisodes: saved.results },
    200,
    { 'Content-Disposition': `attachment; filename="discover-export-${date}.json"` },
  );
}
