import type { Env } from '../env';
import { HttpError, json } from '../http';
import { KINDS, QUESTION_STATES } from './validation';

const COLUMNS = `r.id, r.title, substr(r.body_md, 1, 280) AS excerpt, r.kind,
  r.question_state AS questionState, r.origin, r.source_name AS sourceName, r.tags_json,
  r.created_at AS createdAt, r.updated_at AS updatedAt, r.deleted_at AS deletedAt,
  (SELECT target_title FROM reflection_links l WHERE l.reflection_id=r.id ORDER BY l.created_at LIMIT 1) AS firstLinkTitle,
  (SELECT COUNT(*) FROM reflection_links l WHERE l.reflection_id=r.id) AS linkCount`;
interface ListRow { id: string; updatedAt: string; tags_json: string; snippet?: string }

function filters(params: URLSearchParams) {
  const where: string[] = [], values: string[] = [];
  for (const [param, column, allowed] of [
    ['kind', 'r.kind', KINDS], ['origin', 'r.origin', ['personal', 'article']],
    ['question_state', 'r.question_state', QUESTION_STATES],
  ] as const) {
    const value = params.get(param);
    if (value === null) continue;
    if (!(allowed as readonly string[]).includes(value)) throw new HttpError(400, 'invalid_filter', `Filtre ${param} invalide.`);
    where.push(`${column}=?`); values.push(value);
  }
  const tag = params.get('tag');
  if (tag !== null) {
    if (!tag.trim() || tag.length > 40) throw new HttpError(400, 'invalid_filter', 'Étiquette invalide.');
    where.push('EXISTS (SELECT 1 FROM json_each(r.tags_json) WHERE value=?)'); values.push(tag.trim());
  }
  return { where, values };
}

function after(cursor: string | null, scope: string) {
  if (cursor === null) return null;
  try {
    if (cursor.length > 4096) throw new Error();
    const value: unknown = JSON.parse(atob(cursor));
    if (!Array.isArray(value) || value.length !== 3 || value[0] !== scope ||
      typeof value[1] !== 'string' || !Number.isFinite(Date.parse(value[1])) ||
      typeof value[2] !== 'string' || !/^[0-9a-f-]{36}$/.test(value[2])) throw new Error();
    return { at: value[1], id: value[2] };
  } catch { throw new HttpError(400, 'invalid_cursor', 'Curseur invalide ou filtres différents.'); }
}

/** Segments de texte sûrs à rendre en React : aucune balise HTML fournie par le serveur. */
function highlights(value: string) {
  return value.split('\u0001').flatMap((part, index) => {
    if (!index) return [{ text: part, highlighted: false }];
    const [marked = '', ...rest] = part.split('\u0002');
    return [{ text: marked, highlighted: true }, { text: rest.join('\u0002'), highlighted: false }];
  }).filter((part) => part.text);
}

async function page(req: Request, env: Env, searching: boolean) {
  const params = new URL(req.url).searchParams;
  const { where, values } = filters(params);
  const query = (params.get('q') ?? '').trim();
  let from = 'reflections r';
  let snippets = '';
  if (searching) {
    // Les mots sont littéraux : ni opérateurs FTS ni syntaxe SQL fournis par le client.
    const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (query.length > 200 || !words.length) throw new HttpError(400, 'invalid_search', 'Recherche attendue : 1 à 200 caractères avec lettres ou chiffres.');
    from += ' JOIN search_index ON search_index.ref_id=r.id';
    where.push("search_index MATCH ?", "search_index.kind='reflection'");
    values.push(`{title body} : (${words.map((word) => `"${word}"`).join(' AND ')})`);
    snippets = `, snippet(search_index, -1, char(1), char(2), '…', 40) AS snippet`;
  }
  where.push(`r.deleted_at IS ${!searching && params.get('trash') === '1' ? 'NOT ' : ''}NULL`);
  const scope = JSON.stringify([searching, query, ...['kind', 'tag', 'origin', 'question_state', 'trash'].map((key) => params.get(key))]);
  // Le scope est encodé en URI pour que les étiquettes Unicode restent compatibles avec btoa.
  const scopeKey = encodeURIComponent(scope);
  const cursor = after(params.get('cursor'), scopeKey);
  if (cursor) {
    where.push('(r.updated_at<? OR (r.updated_at=? AND r.id<?))');
    values.push(cursor.at, cursor.at, cursor.id);
  }
  const size = searching ? 30 : 500;
  const { results } = await env.DB.prepare(`SELECT ${COLUMNS}${snippets} FROM ${from}
    WHERE ${where.join(' AND ')} ORDER BY r.updated_at DESC, r.id DESC LIMIT ${size + 1}`).bind(...values).all<ListRow>();
  const rows = results.slice(0, size), last = rows.at(-1);
  return json({ reflections: rows.map(({ tags_json, snippet, ...row }) => ({
    ...row, tags: JSON.parse(tags_json) as string[],
    ...(snippet === undefined ? {} : { excerpt: snippet.replace(/[\u0001\u0002]/g, ''), highlights: highlights(snippet) }),
  })), nextCursor: results.length > size && last ? btoa(JSON.stringify([scopeKey, last.updatedAt, last.id])) : null });
}

export const list = (req: Request, env: Env) => page(req, env, false);
export const search = (req: Request, env: Env) => page(req, env, true);
