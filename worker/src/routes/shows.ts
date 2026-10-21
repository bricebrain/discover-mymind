import { channelInput, resolveChannel, validateChannelFeed } from '../youtube/channels';
import { fetchYoutubeFeed } from '../youtube/request';
import { autoPrepareEnabled, setAutoPrepareEnabled } from '../queue/automatic';
import { channelFeedUrl, parseYoutubeFeed } from '../youtube/feed';
import { USER_AGENT } from '../collector';
import type { Env } from '../env';
import { apiError, HttpError, json, noContent, readJson } from '../http';
import { parseSafeUrl } from '../security/safeUrl';

export const CATEGORIES = ['tech', 'science', 'economy', 'news', 'football', 'stories', 'humour'] as const;
export type Category = (typeof CATEGORIES)[number];
export const MAX_SHOWS = 50;

/** Discover suit seulement des chaînes YouTube (décision du 21 octobre 2026) : les podcasts ne sont plus proposés. */
interface ShowPreview {
  sourceType: 'youtube';
  channelId: string;
  feedUrl: string;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
  language: 'fr' | 'en' | null;
  medianMinutes: number | null;
  episodesPerWeek: number | null;
  latest: { title: string; publishedAt: string | null; durationSec: number | null }[];
}

const lang = (v: string | null): 'fr' | 'en' | null => {
  const l = (v ?? '').toLowerCase();
  return l.startsWith('fr') ? 'fr' : l.startsWith('en') ? 'en' : null;
};

/** Aperçu du flux d'une chaîne, sans rien enregistrer : 8 dernières vidéos au plus. */
export async function previewFeed(feedUrl: string, fetcher: typeof fetch, channelId: string): Promise<ShowPreview> {
  const url = parseSafeUrl(feedUrl).toString();
  const res = await fetchYoutubeFeed(url, { headers: { 'User-Agent': USER_AGENT } }, fetcher);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new HttpError(422, 'feed_unreachable', `Flux inaccessible (HTTP ${res.status}).`);
  }
  const { channel, items } = await parseYoutubeFeed(res.body, { maxItems: 8 });
  if (items.length === 0) throw new HttpError(422, 'feed_empty', 'Aucune vidéo lisible dans ce flux.');

  const durations = items.map((i) => i.durationSec).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const dates = items.map((i) => i.publishedAt).filter((d): d is string => d !== null).map(Date.parse).sort((a, b) => b - a);
  const spanDays = dates.length > 2 ? (dates[0]! - dates[dates.length - 1]!) / 86_400_000 : 0;
  return {
    sourceType: 'youtube', channelId,
    feedUrl: url,
    title: channel?.title || 'Chaîne sans titre',
    publisher: channel?.author ?? null,
    imageUrl: channel?.imageUrl ?? null,
    language: lang(channel?.language ?? null),
    medianMinutes: durations.length ? Math.round(durations[Math.floor(durations.length / 2)]! / 60) : null,
    episodesPerWeek: spanDays > 0 ? Math.round(((dates.length - 1) / spanDays) * 7 * 10) / 10 : null,
    latest: items.slice(0, 3).map((i) => ({ title: i.title, publishedAt: i.publishedAt, durationSec: i.durationSec })),
  };
}

const NOT_A_CHANNEL = 'Discover suit seulement des chaînes YouTube : colle un lien de chaîne ou son @identifiant.';

/** POST /api/shows/resolve — { input } : lien de chaîne YouTube, @identifiant ou identifiant UC…. */
export async function resolve(req: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const { input } = await readJson<{ input?: unknown }>(req, 4096);
  if (typeof input !== 'string' || input.trim().length < 2 || input.length > 2048) {
    throw new HttpError(400, 'invalid_body', NOT_A_CHANNEL);
  }
  const value = input.trim();
  if (!(value.startsWith('@') || /^UC[A-Za-z0-9_-]{22}$/.test(value) || /^https?:\/\/(?:www\.|m\.)?youtube\.com(?:\/|$)/i.test(value))) {
    throw new HttpError(422, 'invalid_channel', NOT_A_CHANNEL);
  }
  const id = await resolveChannel(value, fetcher);
  return json({ kind: 'preview', preview: await previewFeed(channelFeedUrl(id), fetcher, id) });
}

/** POST /api/shows/preview — { feedUrl } : aperçu d'une chaîne déjà résolue. */
export async function preview(req: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const body = await readJson<{ feedUrl?: unknown }>(req, 4096);
  if (typeof body.feedUrl !== 'string') throw new HttpError(400, 'invalid_body', 'Adresse du flux attendue.');
  const channelId = channelInput(body.feedUrl).id;
  if (!channelId) throw new HttpError(422, 'invalid_channel', NOT_A_CHANNEL);
  return json({ preview: await previewFeed(channelFeedUrl(channelId), fetcher, channelId) });
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

/** POST /api/shows — abonnement à une chaîne YouTube. La première collecte a lieu au prochain passage du cron. */
export async function create(req: Request, env: Env): Promise<Response> {
  const b = await readJson<Record<string, unknown>>(req, 8192);
  if (typeof b.feedUrl !== 'string' || typeof b.title !== 'string' || b.title.trim() === '' || b.title.length > 200) {
    throw new HttpError(400, 'invalid_body', 'Adresse du flux et titre attendus.');
  }
  const feedUrl = parseSafeUrl(b.feedUrl).toString();
  const imageUrl = typeof b.imageUrl === 'string' && b.imageUrl ? parseSafeUrl(b.imageUrl).toString() : null;
  if ((b.sourceType ?? 'youtube') !== 'youtube') throw new HttpError(422, 'invalid_channel', NOT_A_CHANNEL);
  const channelId = validateChannelFeed(feedUrl, b.channelId);
  const category = validCategory(b.category);
  const language = validLanguage(b.language);
  const filter = validTitleFilter(b.titleFilter);

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM shows WHERE enabled=1 AND source_type='youtube'").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SHOWS) return apiError(409, 'too_many_shows', `${MAX_SHOWS} chaînes actives au maximum.`);
  if (await env.DB.prepare('SELECT 1 FROM shows WHERE feed_url = ?').bind(feedUrl).first()) {
    return apiError(409, 'already_subscribed', 'Tu suis déjà cette chaîne.');
  }

  const base = slugify(b.title);
  let id = base;
  for (let n = 2; await env.DB.prepare('SELECT 1 FROM shows WHERE id = ?').bind(id).first(); n++) id = `${base}-${n}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO shows (id, title, publisher, apple_id, feed_url, language, category, image_url, title_filter_json,
       auto_prepare, enabled, next_check_at, created_at, source_type, channel_id)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'youtube', ?)`,
  ).bind(
    id, b.title.trim(), typeof b.publisher === 'string' ? b.publisher.slice(0, 200) : null,
    feedUrl, language, category, imageUrl,
    filter ? JSON.stringify(filter) : null, now, now, channelId,
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

/** GET /api/shows — chaînes YouTube seulement. */
export async function list(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT ${SHOW_COLUMNS} FROM shows s WHERE s.source_type = 'youtube' ORDER BY s.category, s.title`).all<ShowOut>();
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
  if (!existing) return apiError(404, 'not_found', 'Chaîne inconnue.');
  const b = await readJson<Record<string, unknown>>(req, 4096);
  const sets: string[] = [];
  const values: unknown[] = [];
  if ('enabled' in b) {
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'invalid_body', 'enabled : booléen attendu.');
    sets.push('enabled = ?');
    values.push(b.enabled ? 1 : 0);
    if (b.enabled) {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM shows WHERE enabled=1 AND source_type='youtube'").first<{ n: number }>();
      if (!existing.enabled && (count?.n ?? 0) >= MAX_SHOWS) return apiError(409, 'too_many_shows', `${MAX_SHOWS} chaînes actives au maximum.`);
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
  // Préparation automatique de la dernière vidéo de la chaîne : formule et niveau.
  if ('autoPrepare' in b) {
    if (typeof b.autoPrepare !== 'boolean') throw new HttpError(400, 'invalid_body', 'autoPrepare : booléen attendu.');
    if (b.autoPrepare && existing.source_type !== 'youtube') throw new HttpError(422, 'auto_prepare_unsupported', 'La préparation automatique concerne les chaînes YouTube.');
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
