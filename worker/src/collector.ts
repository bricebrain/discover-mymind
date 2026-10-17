import type { Env } from './env';
import { parseFeedStream, type FeedItem } from './feedParser';
import { sha256Hex } from './security/crypto';
import { parseSafeUrl, safeFetch } from './security/safeUrl';
import { automaticPreparation } from './queue/automatic';

/**
 * Collecte des épisodes (§ 7.1) : une émission par exécution du cron (toutes les minutes),
 * celle dont l'échéance est la plus ancienne. Calibré pour 10 ms de CPU (offre gratuite).
 */
export const CHECK_INTERVAL_MS = 30 * 60_000;
export const BACKOFF_INTERVAL_MS = 24 * 3_600_000;
const BACKOFF_AFTER_FAILURES = 5;
const REDUCED_MAX_ITEMS = 3;
const RETENTION_PER_SHOW = 10;
const RETENTION_MS = 30 * 86_400_000;
/** Marqueur posé avant la requête : s'il est encore là au passage suivant, l'exécution a été interrompue. */
const IN_PROGRESS = 'in_progress';
export const USER_AGENT = 'discover/1.0 (lecteur de podcasts personnel)';

interface ShowRow {
  id: string;
  category: string;
  auto_prepare: number;
  feed_url: string;
  title_filter_json: string | null;
  etag: string | null;
  last_modified: string | null;
  consecutive_failures: number;
  max_items: number;
  last_error: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();

export async function episodeId(showId: string, guid: string): Promise<string> {
  return (await sha256Hex(`${showId}|${guid}`)).slice(0, 20);
}

/** Minuscules sans accents, pour comparer les titres aux mots-clés du filtre. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function matchesTitleFilter(title: string, filterJson: string | null): boolean {
  if (!filterJson) return true;
  let keywords: unknown;
  try {
    keywords = JSON.parse(filterJson);
  } catch {
    return true;
  }
  if (!Array.isArray(keywords) || keywords.length === 0) return true;
  const t = fold(title);
  return keywords.some((k) => typeof k === 'string' && k.trim() !== '' && t.includes(fold(k.trim())));
}

/** URL d'audio ou de transcription acceptable, sinon null (l'épisode est ignoré si c'est l'audio). */
function safeOrNull(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return parseSafeUrl(raw, { allowHttp: true }).toString();
  } catch {
    return null;
  }
}

/** Image : http → https (une image http serait bloquée dans la PWA servie en HTTPS). */
export function imageUrl(raw: string | null): string | null {
  const url = safeOrNull(raw);
  return url?.startsWith('http://') ? `https://${url.slice(7)}` : url;
}

export interface CollectResult {
  showId: string | null;
  status: 'idle' | 'not_modified' | 'ok' | 'error';
  newItems?: number;
  bytesRead?: number;
  stoppedAt?: string;
  error?: string;
}

/** Vérifie une émission. `showId` force une émission précise (tests, ajout manuel). */
export async function collectNext(env: Env, now = Date.now(), fetcher: typeof fetch = fetch, showId?: string): Promise<CollectResult> {
  const show = await (showId
    ? env.DB.prepare('SELECT * FROM shows WHERE id = ?').bind(showId)
    : env.DB.prepare('SELECT * FROM shows WHERE enabled = 1 AND next_check_at <= ? ORDER BY next_check_at LIMIT 1').bind(iso(now))
  ).first<ShowRow>();
  if (!show) return { showId: null, status: 'idle' };

  // Exécution précédente interrompue (dépassement de CPU probable) : on réduit la lecture.
  const interrupted = show.last_error === IN_PROGRESS;
  const failures = show.consecutive_failures + (interrupted ? 1 : 0);
  const maxItems = interrupted ? Math.min(show.max_items, REDUCED_MAX_ITEMS) : show.max_items;
  const nextCheck = iso(now + (failures >= BACKOFF_AFTER_FAILURES ? BACKOFF_INTERVAL_MS : CHECK_INTERVAL_MS));

  // L'échéance avance AVANT la requête : une exécution interrompue ne bloque pas la file.
  await env.DB.prepare(
    `UPDATE shows SET next_check_at = ?, last_attempt_at = ?, last_error = ?, consecutive_failures = ?, max_items = ? WHERE id = ?`,
  ).bind(nextCheck, iso(now), IN_PROGRESS, failures, maxItems, show.id).run();

  try {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' };
    if (show.etag) headers['If-None-Match'] = show.etag;
    if (show.last_modified) headers['If-Modified-Since'] = show.last_modified;
    const res = await safeFetch(show.feed_url, { allowHttp: true, headers }, fetcher);

    if (res.status === 304) {
      await env.DB.prepare('UPDATE shows SET last_success_at = ?, last_error = NULL, consecutive_failures = 0 WHERE id = ?')
        .bind(iso(now), show.id).run();
      if (show.auto_prepare) await automaticPreparation(env,show.id,now).run();
      return { showId: show.id, status: 'not_modified' };
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }

    const { results: known } = await env.DB.prepare(
      'SELECT guid FROM episodes WHERE show_id = ? ORDER BY published_at DESC LIMIT 30',
    ).bind(show.id).all<{ guid: string }>();
    const parsed = await parseFeedStream(res.body, { maxItems, knownGuids: new Set(known.map((k) => k.guid)) });
    if (!parsed.channel && parsed.items.length === 0 && known.length === 0) throw new Error('Flux illisible (aucun épisode)');

    const fresh = parsed.items.filter((it) => matchesTitleFilter(it.title, show.title_filter_json));
    const statements = [];
    for (const it of fresh) {
      const stmt = await insertEpisode(env, show.id, it, now);
      if (stmt) statements.push(stmt);
    }
    statements.push(
      env.DB.prepare(
        `UPDATE shows SET etag = ?, last_modified = ?, last_success_at = ?, last_error = NULL, consecutive_failures = 0,
           image_url = COALESCE(image_url, ?) WHERE id = ?`,
      ).bind(res.headers.get('ETag'), res.headers.get('Last-Modified'), iso(now), imageUrl(parsed.channel?.imageUrl ?? null), show.id),
      // Les histoires restent écoutables en archive ; les autres catégories expirent après 30 jours.
      env.DB.prepare(
        `DELETE FROM episodes WHERE show_id = ? AND state <> 'saved' AND content_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM prepare_queue q WHERE q.kind='episode' AND q.ref=episodes.id AND q.status IN ('pending','leased'))
           AND ((? <> 'stories' AND COALESCE(published_at, created_at) < ?)
                OR id NOT IN (SELECT id FROM episodes WHERE show_id = ? ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?))`,
      ).bind(show.id, show.category, iso(now - RETENTION_MS), show.id, RETENTION_PER_SHOW),
    );
    if (show.auto_prepare) statements.push(automaticPreparation(env,show.id,now));
    await env.DB.batch(statements);
    return { showId: show.id, status: 'ok', newItems: fresh.length, bytesRead: parsed.bytesRead, stoppedAt: parsed.stoppedAt };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    const total = failures + 1;
    await env.DB.prepare('UPDATE shows SET last_error = ?, consecutive_failures = ?, next_check_at = ? WHERE id = ?')
      .bind(message, total, iso(now + (total >= BACKOFF_AFTER_FAILURES ? BACKOFF_INTERVAL_MS : CHECK_INTERVAL_MS)), show.id).run();
    return { showId: show.id, status: 'error', error: message };
  }
}

async function insertEpisode(env: Env, showId: string, it: FeedItem, now: number) {
  const audioUrl = safeOrNull(it.audioUrl);
  if (!audioUrl) return null;
  return env.DB.prepare(
    `INSERT OR IGNORE INTO episodes
       (id, show_id, guid, title, description, published_at, duration_sec, audio_url, image_url, transcript_url, transcript_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    await episodeId(showId, it.guid), showId, it.guid, it.title, it.description, it.publishedAt, it.durationSec,
    audioUrl, imageUrl(it.imageUrl), safeOrNull(it.transcriptUrl), it.transcriptUrl ? it.transcriptType : null, iso(now),
  );
}
