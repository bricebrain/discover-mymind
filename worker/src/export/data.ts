import type { Env } from '../env';
import { pageSql, type Page } from './pagination';

interface NoteRow {
  id: string; title: string | null; body_md: string; kind: string; question_state: string | null; tags_json: string;
  english_content_id: string | null; origin: string; source_name: string | null; source_url: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
}
interface NoteLinkRow {
  reflection_id: string; target_type: string; target_id: string; variant_key: string; segment_id: string;
  quote: string | null; target_title: string;
}
export interface NoteOut {
  id: string; title: string | null; body: string; kind: string; questionState: string | null; tags: string[];
  englishContentId: string | null; origin: string; sourceName: string | null; sourceUrl: string | null;
  createdAt: string; updatedAt: string; deletedAt: string | null;
  links: { targetType: string; targetId: string; variantKey: string | null; segmentId: string | null; quote: string | null; targetTitle: string }[];
}

/** Notes (corbeille incluse, marquée `deletedAt`) et leurs liens — même forme que la sortie de reflections.out. */
export async function loadNotes(env: Env, page?: Page): Promise<NoteOut[]> {
  const [notes, links] = await Promise.all([
    env.DB.prepare(`SELECT * FROM reflections ORDER BY created_at, id ${pageSql(page)}`).all<NoteRow>(),
    env.DB.prepare(`SELECT reflection_id, target_type, target_id, variant_key, segment_id, quote, target_title FROM reflection_links WHERE reflection_id IN (SELECT id FROM reflections ORDER BY created_at, id ${pageSql(page)}) ORDER BY reflection_id, created_at`)
      .all<NoteLinkRow>(),
  ]);
  const byNote = new Map<string, NoteLinkRow[]>();
  for (const l of links.results) byNote.set(l.reflection_id, [...(byNote.get(l.reflection_id) ?? []), l]);
  return notes.results.map((r) => ({
    id: r.id, title: r.title, body: r.body_md, kind: r.kind, questionState: r.question_state,
    tags: JSON.parse(r.tags_json) as string[], englishContentId: r.english_content_id,
    origin: r.origin, sourceName: r.source_name, sourceUrl: r.source_url,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
    links: (byNote.get(r.id) ?? []).map((l) => ({
      targetType: l.target_type, targetId: l.target_id, variantKey: l.variant_key || null,
      segmentId: l.segment_id || null, quote: l.quote, targetTitle: l.target_title,
    })),
  }));
}

// ── Émissions, épisodes sauvegardés, écoute, préparations ───────────────────

/** Abonnements (podcasts et chaînes YouTube) : la configuration, sans l'état interne de collecte. */
export async function loadShows(env: Env, page?: Page) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, publisher, source_type, channel_id, feed_url, apple_id, image_url, language, category,
       title_filter_json, auto_prepare, auto_preset, auto_level, enabled, created_at FROM shows ORDER BY id ${pageSql(page)}`,
  ).all<{
    id: string; title: string; publisher: string | null; source_type: string; channel_id: string | null; feed_url: string;
    apple_id: number | null; image_url: string | null; language: string; category: string; title_filter_json: string | null;
    auto_prepare: number; auto_preset: string; auto_level: string; enabled: number; created_at: string;
  }>();
  return results.map((s) => ({
    id: s.id, title: s.title, publisher: s.publisher, sourceType: s.source_type, channelId: s.channel_id,
    feedUrl: s.feed_url, appleId: s.apple_id, imageUrl: s.image_url, language: s.language, category: s.category,
    titleFilter: s.title_filter_json ? JSON.parse(s.title_filter_json) as string[] : null,
    autoPrepare: s.auto_prepare === 1, autoPreset: s.auto_preset, autoLevel: s.auto_level,
    enabled: s.enabled === 1, createdAt: s.created_at,
  }));
}

export async function loadSavedEpisodes(env: Env, page?: Page) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.show_id, e.title, e.audio_url, e.published_at, e.video_id, e.guid, e.description, e.duration_sec, e.image_url,
            e.transcript_url, e.transcript_type, e.content_id, e.created_at, s.title AS show
       FROM episodes e JOIN shows s ON s.id = e.show_id WHERE e.state = 'saved' ORDER BY e.published_at DESC, e.id ${pageSql(page)}`,
  ).all<{ id: string; show_id: string; title: string; audio_url: string; published_at: string | null; video_id: string | null; show: string; guid: string; description: string | null; duration_sec: number | null;
    image_url: string | null; transcript_url: string | null; transcript_type: string | null; content_id: string | null; created_at: string }>();
  return results.map((e) => ({
    id: e.id, showId: e.show_id, title: e.title, show: e.show, audioUrl: e.audio_url,
    publishedAt: e.published_at, videoId: e.video_id, guid: e.guid, description: e.description, durationSec: e.duration_sec,
    imageUrl: e.image_url, transcriptUrl: e.transcript_url, transcriptType: e.transcript_type, contentId: e.content_id, createdAt: e.created_at, state: 'saved',
  }));
}

export async function loadProgress(env: Env, page?: Page) {
  const { results } = await env.DB.prepare(
    `SELECT target_type, target_id, audio_ref, position_ms, duration_ms, completed, updated_at FROM listening_progress ORDER BY updated_at, target_type, target_id ${pageSql(page)}`,
  ).all<{ target_type: string; target_id: string; audio_ref: string; position_ms: number; duration_ms: number | null; completed: number; updated_at: string }>();
  return results.map((p) => ({
    targetType: p.target_type, targetId: p.target_id, audioRef: p.audio_ref, positionMs: p.position_ms,
    durationMs: p.duration_ms, completed: p.completed === 1, updatedAt: p.updated_at,
  }));
}

/** File des préparations : statut, options, dates — jamais les jetons de bail ni leur propriétaire. */
export async function loadPreparations(env: Env, page?: Page) {
  const { results } = await env.DB.prepare(
    `SELECT id, kind, ref, options_json, status, stage, attempts, max_attempts, content_id, error, created_at, updated_at
       FROM prepare_queue ORDER BY created_at DESC, id ${pageSql(page)}`,
  ).all<{
    id: string; kind: string; ref: string; options_json: string; status: string; stage: string | null;
    attempts: number; max_attempts: number; content_id: string | null; error: string | null; created_at: string; updated_at: string;
  }>();
  return results.map((q) => ({
    id: q.id, kind: q.kind, ref: q.ref, options: JSON.parse(q.options_json) as unknown, status: q.status,
    stage: q.stage, attempts: q.attempts, maxAttempts: q.max_attempts, contentId: q.content_id,
    error: q.error, createdAt: q.created_at, updatedAt: q.updated_at,
  }));
}

export async function loadAppSettings(env: Env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM app_settings').all<{ key: string; value: string }>();
  const values = new Map(results.map((r) => [r.key, r.value]));
  return { autoPrepareEnabled: values.get('auto_prepare_enabled') !== '0' };
}
