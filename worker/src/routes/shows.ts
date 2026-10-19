import { channelInput, resolveChannel, validateChannelFeed } from '../youtube/channels';
import { autoPrepareEnabled, setAutoPrepareEnabled } from '../queue/automatic';
import { channelFeedUrl, parseYoutubeFeed } from '../youtube/feed';
import { USER_AGENT } from '../collector';
import type { Env } from '../env';
import { parseFeedStream } from '../feedParser';
import { apiError, HttpError, json, noContent, readJson } from '../http';
import { parseSafeUrl, safeFetch } from '../security/safeUrl';

export const CATEGORIES = ['tech', 'science', 'economy', 'news', 'football', 'stories', 'humour'] as const;
export type Category = (typeof CATEGORIES)[number];
export const MAX_SHOWS = 50;

interface ShowPreview {
  sourceType: 'podcast' | 'youtube';
  channelId: string | null;
  feedUrl: string;
  title: string;
  publisher: string | null;
  appleId: number | null;
  imageUrl: string | null;
  language: 'fr' | 'en' | null;
  medianMinutes: number | null;
  episodesPerWeek: number | null;
  hasTranscripts: boolean;
  latest: { title: string; publishedAt: string | null; durationSec: number | null }[];
}

interface Candidate {
  appleId: number;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
  feedUrl: string;
}

const APPLE_LINK = /^https:\/\/podcasts\.apple\.com\/.*\/id(\d{3,12})(?:[/?#]|$)/i;

async function appleJson(path: string, fetcher: typeof fetch): Promise<{ results?: Record<string, unknown>[] }> {
  const res = await safeFetch(`https://itunes.apple.com/${path}`, { headers: { 'User-Agent': USER_AGENT } }, fetcher);
  if (!res.ok) throw new HttpError(502, 'apple_unavailable', 'Annuaire Apple indisponible.');
  return res.json();
}

function toCandidate(r: Record<string, unknown>): Candidate | null {
  if (typeof r.feedUrl !== 'string' || typeof r.collectionId !== 'number') return null;
  try {
    parseSafeUrl(r.feedUrl, { allowHttp: true });
  } catch {
    return null;
  }
  return {
    appleId: r.collectionId,
    title: String(r.collectionName ?? ''),
    publisher: typeof r.artistName === 'string' ? r.artistName : null,
    imageUrl: typeof r.artworkUrl600 === 'string' ? r.artworkUrl600 : typeof r.artworkUrl100 === 'string' ? r.artworkUrl100 : null,
    feedUrl: r.feedUrl,
  };
}

const lang = (v: string | null): 'fr' | 'en' | null => {
  const l = (v ?? '').toLowerCase();
  return l.startsWith('fr') ? 'fr' : l.startsWith('en') ? 'en' : null;
};

/** Aperçu d'un flux, sans rien enregistrer : 8 derniers épisodes au plus. */
export async function previewFeed(feedUrl: string, fetcher: typeof fetch, apple?: Candidate, channelId?: string): Promise<ShowPreview> {
  const url = parseSafeUrl(feedUrl, { allowHttp: true }).toString();
  const res = await safeFetch(url, { allowHttp: true, headers: { 'User-Agent': USER_AGENT } }, fetcher);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new HttpError(422, 'feed_unreachable', `Flux inaccessible (HTTP ${res.status}).`);
  }
  const { channel, items } = await (channelId ? parseYoutubeFeed : parseFeedStream)(res.body, { maxItems: 8 });
  if (items.length === 0) throw new HttpError(422, 'feed_empty', 'Aucun épisode lisible dans ce flux.');

  const durations = items.map((i) => i.durationSec).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const dates = items.map((i) => i.publishedAt).filter((d): d is string => d !== null).map(Date.parse).sort((a, b) => b - a);
  const spanDays = dates.length > 2 ? (dates[0]! - dates[dates.length - 1]!) / 86_400_000 : 0;
  return {
    sourceType: channelId ? 'youtube' : 'podcast', channelId: channelId ?? null,
    feedUrl: url,
    title: apple?.title || channel?.title || 'Émission sans titre',
    publisher: apple?.publisher ?? channel?.author ?? null,
    appleId: apple?.appleId ?? null,
    imageUrl: apple?.imageUrl ?? channel?.imageUrl ?? null,
    language: lang(channel?.language ?? null),
    medianMinutes: durations.length ? Math.round(durations[Math.floor(durations.length / 2)]! / 60) : null,
    episodesPerWeek: spanDays > 0 ? Math.round(((dates.length - 1) / spanDays) * 7 * 10) / 10 : null,
    hasTranscripts: items.some((i) => i.transcriptUrl),
    latest: items.slice(0, 3).map((i) => ({ title: i.title, publishedAt: i.publishedAt, durationSec: i.durationSec })),
  };
}

/** POST /api/shows/resolve — { input } : nom, lien Apple, identifiant Apple ou URL RSS. */
export async function resolve(req: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const { input } = await readJson<{ input?: unknown }>(req, 4096);
  if (typeof input !== 'string' || input.trim().length < 2 || input.length > 2048) {
    throw new HttpError(400, 'invalid_body', 'Saisis un nom, un lien Apple Podcasts ou une adresse RSS.');
  }
  const value = input.trim();
  if (value.startsWith('@') || /^UC[A-Za-z0-9_-]{22}$/.test(value) || /^https?:\/\/(?:www\.|m\.)?youtube\.com(?:\/|$)/i.test(value)) {
    const id = await resolveChannel(value, fetcher);
    return json({ kind: 'preview', preview: await previewFeed(channelFeedUrl(id), fetcher, undefined, id) });
  }
  const appleId = value.match(APPLE_LINK)?.[1] ?? (/^\d{3,12}$/.test(value) ? value : null);

  if (appleId) {
    const data = await appleJson(`lookup?id=${appleId}&entity=podcast`, fetcher);
    const candidate = (data.results ?? []).map(toCandidate).find((c) => c !== null);
    if (!candidate) throw new HttpError(404, 'not_found', 'Émission introuvable dans l’annuaire Apple, ou sans flux RSS public.');
    return json({ kind: 'preview', preview: await previewFeed(candidate.feedUrl, fetcher, candidate) });
  }
  if (/^https?:\/\//i.test(value)) {
    return json({ kind: 'preview', preview: await previewFeed(value, fetcher) });
  }
  const q = new URLSearchParams({ term: value.slice(0, 100), media: 'podcast', entity: 'podcast', limit: '12', country: 'fr' });
  const data = await appleJson(`search?${q}`, fetcher);
  const candidates = (data.results ?? []).map(toCandidate).filter((c): c is Candidate => c !== null);
  return json({ kind: 'candidates', candidates });
}

/** POST /api/shows/preview — { feedUrl, appleId? } : aperçu d'un candidat choisi. */
export async function preview(req: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const body = await readJson<{ feedUrl?: unknown; title?: unknown; publisher?: unknown; imageUrl?: unknown; appleId?: unknown }>(req, 4096);
  if (typeof body.feedUrl !== 'string') throw new HttpError(400, 'invalid_body', 'Adresse du flux attendue.');
  const apple = typeof body.appleId === 'number' && typeof body.title === 'string'
    ? { appleId: body.appleId, title: body.title, publisher: typeof body.publisher === 'string' ? body.publisher : null,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : null, feedUrl: body.feedUrl }
    : undefined;
  let channelId: string | undefined;
  try { channelId = channelInput(body.feedUrl).id ?? undefined; } catch { /* Flux podcast. */ }
  return json({ preview: await previewFeed(body.feedUrl, fetcher, apple, channelId) });
}

function slugify(title: string): string {
  const s = title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56);
  return s.length >= 2 ? s : 'emission';
}

function validTitleFilter(v: unknown): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.length > 10 || v.some((k) => typeof k !== 'string' || k.trim().length === 0 || k.length > 40)) {
    throw new HttpError(400, 'invalid_body', 'Filtre de titre : 10 mots-clés au plus, 40 caractères chacun.');
  }
  return v.map((k: string) => k.trim());
}

function validCategory(v: unknown): Category {
  if (typeof v !== 'string' || !(CATEGORIES as readonly string[]).includes(v)) {
    throw new HttpError(400, 'invalid_body', `Catégorie attendue : ${CATEGORIES.join(', ')}.`);
  }
  return v as Category;
}

function validLanguage(v: unknown): 'fr' | 'en' {
  if (v !== 'fr' && v !== 'en') throw new HttpError(400, 'invalid_body', 'Langue attendue : fr ou en.');
  return v;
}

/** POST /api/shows — abonnement. La première collecte a lieu au prochain passage du cron. */
export async function create(req: Request, env: Env): Promise<Response> {
  const b = await readJson<Record<string, unknown>>(req, 8192);
  if (typeof b.feedUrl !== 'string' || typeof b.title !== 'string' || b.title.trim() === '' || b.title.length > 200) {
    throw new HttpError(400, 'invalid_body', 'Adresse du flux et titre attendus.');
  }
  const feedUrl = parseSafeUrl(b.feedUrl, { allowHttp: true }).toString();
  const imageUrl = typeof b.imageUrl === 'string' && b.imageUrl ? parseSafeUrl(b.imageUrl).toString() : null;
  const sourceType = b.sourceType ?? 'podcast';
  if (sourceType !== 'podcast' && sourceType !== 'youtube') throw new HttpError(400, 'invalid_body', 'Source inconnue.');
  const channelId = sourceType === 'youtube' ? validateChannelFeed(feedUrl, b.channelId) : null;
  if (sourceType === 'podcast' && (b.channelId || new URL(feedUrl).hostname.endsWith('youtube.com'))) {
    throw new HttpError(422, 'invalid_channel', 'Choisis une chaîne YouTube pour ce flux.');
  }
  const category = validCategory(b.category);
  const language = validLanguage(b.language);
  const filter = validTitleFilter(b.titleFilter);

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM shows WHERE enabled=1').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SHOWS) return apiError(409, 'too_many_shows', `${MAX_SHOWS} émissions actives au maximum.`);
  if (await env.DB.prepare('SELECT 1 FROM shows WHERE feed_url = ?').bind(feedUrl).first()) {
    return apiError(409, 'already_subscribed', 'Tu suis déjà cette émission.');
  }

  const base = slugify(b.title);
  let id = base;
  for (let n = 2; await env.DB.prepare('SELECT 1 FROM shows WHERE id = ?').bind(id).first(); n++) id = `${base}-${n}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO shows (id, title, publisher, apple_id, feed_url, language, category, image_url, title_filter_json,
       auto_prepare, enabled, next_check_at, created_at, source_type, channel_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`,
  ).bind(
    id, b.title.trim(), typeof b.publisher === 'string' ? b.publisher.slice(0, 200) : null,
    typeof b.appleId === 'number' ? b.appleId : null, feedUrl, language, category, imageUrl,
    filter ? JSON.stringify(filter) : null, now, now, sourceType, channelId,
  ).run();
  return json({ show: await getShow(env, id) }, 201);
}

const SHOW_COLUMNS = `s.source_type AS sourceType, s.channel_id AS channelId, s.id, s.title, s.publisher, s.feed_url AS feedUrl, s.language, s.category, s.image_url AS imageUrl,
  s.title_filter_json AS titleFilterJson, s.auto_prepare AS autoPrepare, s.auto_preset AS autoPreset, s.auto_level AS autoLevel, s.enabled, s.last_success_at AS lastSuccessAt,
  s.last_attempt_at AS lastAttemptAt, s.last_error AS lastError, s.consecutive_failures AS consecutiveFailures,
  s.next_check_at AS nextCheckAt,
  (SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id) AS episodeCount`;

type ShowOut = Record<string, unknown> & { titleFilterJson?: string | null };
function showOut(r: ShowOut) {
  const { titleFilterJson, ...rest } = r;
  return {
    ...rest,
    titleFilter: titleFilterJson ? (JSON.parse(titleFilterJson) as string[]) : null,
    enabled: rest.enabled === 1,
    autoPrepare: rest.autoPrepare === 1,
    lastError: rest.lastError === 'in_progress' ? null : rest.lastError,
  };
}

async function getShow(env: Env, id: string) {
  const r = await env.DB.prepare(`SELECT ${SHOW_COLUMNS} FROM shows s WHERE s.id = ?`).bind(id).first<ShowOut>();
  return r ? showOut(r) : null;
}

/** GET /api/shows */
export async function list(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT ${SHOW_COLUMNS} FROM shows s ORDER BY s.category, s.title`).all<ShowOut>();
  return json({ shows: results.map(showOut), max: MAX_SHOWS, categories: CATEGORIES, autoPrepareEnabled: await autoPrepareEnabled(env) });
}

/** GET / PUT /api/settings/auto-prepare — interrupteur général des préparations automatiques. */
export async function autoPrepareSetting(req: Request, env: Env): Promise<Response> {
  if (req.method === 'PUT') {
    const b = await readJson<Record<string, unknown>>(req, 256);
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'invalid_body', 'enabled : booléen attendu.');
    await setAutoPrepareEnabled(env, b.enabled);
  }
  return json({ enabled: await autoPrepareEnabled(env) });
}

/** PATCH /api/shows/:id — enabled, category, language, titleFilter. */
export async function update(req: Request, env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare('SELECT enabled, source_type FROM shows WHERE id = ?').bind(id).first<{ enabled: number; source_type: string }>();
  if (!existing) return apiError(404, 'not_found', 'Émission inconnue.');
  const b = await readJson<Record<string, unknown>>(req, 4096);
  const sets: string[] = [];
  const values: unknown[] = [];
  if ('enabled' in b) {
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'invalid_body', 'enabled : booléen attendu.');
    sets.push('enabled = ?');
    values.push(b.enabled ? 1 : 0);
    if (b.enabled) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM shows WHERE enabled=1').first<{ n: number }>();
      if (!existing.enabled && (count?.n ?? 0) >= MAX_SHOWS) return apiError(409, 'too_many_shows', `${MAX_SHOWS} émissions actives au maximum.`);
      sets.push('next_check_at = ?', 'consecutive_failures = 0');
      values.push(new Date().toISOString());
    }
  }
  if ('category' in b) {
    sets.push('category = ?');
    values.push(validCategory(b.category));
  }
  if ('language' in b) {
    sets.push('language = ?');
    values.push(validLanguage(b.language));
  }
  if ('titleFilter' in b) {
    const f = validTitleFilter(b.titleFilter);
    sets.push('title_filter_json = ?');
    values.push(f && f.length ? JSON.stringify(f) : null);
  }
  // Préparation automatique par émission (podcasts seulement) : formule et niveau.
  if ('autoPrepare' in b) {
    if (typeof b.autoPrepare !== 'boolean') throw new HttpError(400, 'invalid_body', 'autoPrepare : booléen attendu.');
    if (b.autoPrepare && existing.source_type === 'youtube') throw new HttpError(422, 'auto_prepare_unsupported', 'La préparation automatique concerne les podcasts.');
    sets.push('auto_prepare = ?');
    values.push(b.autoPrepare ? 1 : 0);
  }
  if ('autoPreset' in b) {
    if (b.autoPreset !== 'essentials4' && b.autoPreset !== 'condensed8') throw new HttpError(400, 'invalid_body', 'Formule : essentials4 ou condensed8.');
    sets.push('auto_preset = ?');
    values.push(b.autoPreset);
  }
  if ('autoLevel' in b) {
    if (!['A2', 'B1', 'B2', 'C1', 'original'].includes(String(b.autoLevel))) throw new HttpError(400, 'invalid_body', 'Niveau invalide.');
    sets.push('auto_level = ?');
    values.push(b.autoLevel);
  }
  if (sets.length === 0) throw new HttpError(400, 'invalid_body', 'Rien à modifier.');
  await env.DB.prepare(`UPDATE shows SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run();
  return json({ show: await getShow(env, id) });
}

/**
 * DELETE /api/shows/:id — désabonnement. Les épisodes sauvegardés ou préparés sont gardés :
 * l'émission est alors seulement désactivée ; sinon elle est supprimée.
 */
export async function remove(env: Env, id: string): Promise<Response> {
  if (!(await env.DB.prepare('SELECT 1 FROM shows WHERE id = ?').bind(id).first())) return apiError(404, 'not_found', 'Émission inconnue.');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM episodes WHERE show_id = ? AND state <> 'saved' AND content_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM prepare_queue q WHERE (q.kind='episode' AND q.ref=episodes.id OR q.kind='youtube' AND q.ref=episodes.video_id) AND q.status IN ('pending','leased'))`).bind(id),
    env.DB.prepare('UPDATE shows SET enabled = 0 WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM shows WHERE id = ? AND NOT EXISTS (SELECT 1 FROM episodes WHERE show_id = ?)').bind(id, id),
  ]);
  return noContent();
}
