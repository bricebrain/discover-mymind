import { env } from 'cloudflare:workers';
import { expect } from 'vitest';
import { canonicalJson } from '../src/publications/validation';
import type { Manifest, Segments } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

/**
 * Export complet (chantier E) : le format v2 doit contenir notes (corbeille incluse), progression,
 * contenus préparés avec leurs segments, dossiers — et jamais le moindre secret.
 * L'export v1 reste servi tel quel via ?v=1.
 */
const bearer = { Authorization: `Bearer ${ATELIER_TOKEN}` };
export const EP = 'a1b2c3d4e5f6a7b8c9d0';
export const CONTENT_ID = 'note-export-test';
export const CHANNEL = 'UC1234567890123456789012';

const bytes = (t: string) => new TextEncoder().encode(t).length;
export let cookie = '';
export let audioSha = '';
export let dossierId = '';

interface Variant {
  key: string; kind: string; language: string; cefrLevel: string | null; timingStatus: string | null;
  audio: { origin: string; source: string; sha256: string | null; sizeBytes: number | null; playbackPath: string | null; streamUrl: string | null } | null;
  segments: { text: string; fr?: string }[] | null; segmentsError: string | null;
}
export interface ExportPayload {
  schemaVersion: number; audioNotice: string;
  reflections: { id: string; origin: string; sourceName: string | null; sourceUrl: string | null; deletedAt: string | null; body: string; links: { targetTitle: string; quote: string | null }[] }[];
  shows: { id: string; sourceType: string; channelId: string | null; feedUrl: string; autoPrepare: boolean; enabled: boolean }[];
  savedEpisodes: { id: string; title: string; show: string; audioUrl: string }[];
  listeningProgress: { targetType: string; targetId: string; positionMs: number; completed: boolean }[];
  preparations: { id: string; kind: string; status: string; options: { coverage?: string; level?: string }; contentId: string | null; error: string | null }[];
  contents: { id: string; title: string; sourceType: string; publication: { id: string; revision: string }; variants: Variant[]; files: { path: string; sha256: string; size: number }[]; error: string | null }[];
  dossiers: { id: string; title: string; sources: unknown[]; runs: { sources: { id: string }[]; options: Record<string, unknown>; preparation: { status: string; contentId: string | null } | null }[] }[];
  appSettings: { autoPrepareEnabled: boolean };
  markdown: string;
}

export async function setupExport() {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reflection_links'), env.DB.prepare('DELETE FROM listening_progress'),
    env.DB.prepare('DELETE FROM queue_events'), env.DB.prepare('DELETE FROM prepare_queue'),
    env.DB.prepare('DELETE FROM dossier_runs'), env.DB.prepare('DELETE FROM push_deliveries'),
    env.DB.prepare('DELETE FROM episodes'), env.DB.prepare('DELETE FROM reflections'),
    env.DB.prepare('DELETE FROM contents'), env.DB.prepare('DELETE FROM publication_files'),
    env.DB.prepare('DELETE FROM publications'), env.DB.prepare('DELETE FROM dossiers'),
    env.DB.prepare('DELETE FROM shows'), env.DB.prepare('DELETE FROM push_subscriptions'),
    env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM login_attempts'),
  ]);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO shows (id, title, feed_url, language, category, next_check_at, created_at)
      VALUES ('s', 'Code source', 'https://feeds.example.com/s.xml', 'fr', 'news', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z')`),
    env.DB.prepare(`INSERT INTO shows (id, title, feed_url, language, category, next_check_at, created_at, source_type, channel_id)
      VALUES ('yt', 'Chaîne tech', 'https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}', 'en', 'tech', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z', 'youtube', '${CHANNEL}')`),
    env.DB.prepare(`INSERT INTO episodes (id, show_id, guid, title, audio_url, published_at, state, created_at)
      VALUES ('${EP}', 's', 'g', 'La dette américaine', 'https://cdn.example.com/a.mp3', '2026-10-17T00:00:00Z', 'saved', '2026-10-17T00:00:00Z')`),
  ]);
  cookie = await login();

  // Notes : un article, une note personnelle liée, une note mise à la corbeille, une note préparée.
  const article = crypto.randomUUID(), perso = crypto.randomUUID(), trash = crypto.randomUUID(), prep = crypto.randomUUID();
  await call('/api/reflections', { method: 'POST', cookie, body: { id: article, title: 'Article lu', body: 'Mes extraits de l’article du jour.', origin: 'article', sourceName: 'Le Monde', sourceUrl: 'https://www.lemonde.fr/economie/article.html', links: [{ targetType: 'episode', targetId: EP, quote: 'le dollar reste dominant' }] } });
  await call('/api/reflections', { method: 'POST', cookie, body: { id: perso, title: 'Réflexion', body: 'Une réflexion assez longue sur la dette publique et sa soutenabilité.', tags: ['économie'] } });
  await call('/api/reflections', { method: 'POST', cookie, body: { id: trash, title: 'À jeter', body: 'Note éphémère à mettre à la corbeille.' } });
  await call(`/api/reflections/${trash}`, { method: 'DELETE', cookie });
  await call('/api/reflections', { method: 'POST', cookie, body: { id: prep, title: 'Ma note préparée', body: 'Une note suffisamment longue pour être préparée et publiée par l’Atelier.' } });

  // Progression d'écoute d'un épisode original.
  await call('/api/progress', { method: 'PUT', cookie, body: { targetType: 'episode', targetId: EP, audioRef: 'https://cdn.example.com/a.mp3', positionMs: 61_000, durationMs: 600_000 } });

  // Dossier avec une exécution (sources capturées + demande de préparation).
  const created = await (await call('/api/dossiers', { method: 'POST', cookie, body: { title: 'Dette publique', sources: [{ type: 'episode', id: EP }, { type: 'reflection', id: perso }] } })).json<{ dossier: { id: string } }>();
  dossierId = created.dossier.id;
  await call(`/api/dossiers/${dossierId}/prepare`, { method: 'POST', cookie, body: { coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 10 } });

  // Publication complète d'un contenu préparé depuis la note (source + adaptation B1 avec audio).
  const queued = await (await call(`/api/reflections/${prep}/prepare`, { method: 'POST', cookie, body: {} })).json<{ item: { id: string } }>();
  const lease = await (await call('/atelier/queue/lease', { method: 'POST', headers: bearer, body: { owner: 'export-test', itemId: queued.item.id } })).json<{ item: { id: string; leaseToken: string } }>();
  const sourceDoc: Segments = { schemaVersion: 1, variantKey: 'fr-source', segments: [
    { id: 's0001', text: 'Le paragraphe source en français.', startMs: null, endMs: null },
    { id: 's0002', text: 'Un second paragraphe source.', startMs: null, endMs: null },
  ] };
  const enDoc: Segments = { keyVocab: ['debt'], schemaVersion: 1, variantKey: 'en-full-b1', segments: [
    { id: 'p0001', text: 'The adapted English paragraph.', fr: 'Le paragraphe anglais adapté.', speaker: 'Narrator', startMs: 0, endMs: 2000 },
    { id: 'p0002', text: 'A second adapted paragraph.', fr: 'Un second paragraphe adapté.', speaker: 'Narrator', startMs: 2000, endMs: 4000 },
  ] };
  const sourceRaw = canonicalJson(sourceDoc), enRaw = canonicalJson(enDoc), audioRaw = 'fake-audio-bytes-for-export-test';
  audioSha = await sha256Hex(audioRaw);
  const m: Manifest = {
    schemaVersion: 1,
    content: { id: CONTENT_ID, title: 'Ma note préparée', originalLanguage: 'fr', sourceType: 'reflection', sourceRef: `reflection:${prep}`, rights: 'personal_use' },
    variants: [
      { key: 'fr-source', kind: 'source', language: 'fr', segmentsFile: 'segments/fr-source.json' },
      { key: 'en-full-b1', kind: 'adaptation', language: 'en', cefrLevel: 'B1', style: 'narration', derivedFrom: 'fr-source', coverage: 'full', segmentsFile: 'segments/en-full-b1.json', generation: { provider: 'fixture', model: 'test-model' }, evaluation: { verdict: 'ok' }, audio: { source: 'r2', file: 'audio/en-full-b1.mp3', origin: 'kokoro', durationMs: 4000, timingSource: 'kokoro' } },
    ],
    files: {
      'segments/fr-source.json': { sha256: await sha256Hex(sourceRaw), size: bytes(sourceRaw), contentType: 'application/json' },
      'segments/en-full-b1.json': { sha256: await sha256Hex(enRaw), size: bytes(enRaw), contentType: 'application/json' },
      'audio/en-full-b1.mp3': { sha256: audioSha, size: bytes(audioRaw), contentType: 'audio/mpeg' },
    },
    removeVariants: [],
  };
  const data: Record<string, string> = { 'segments/fr-source.json': sourceRaw, 'segments/en-full-b1.json': enRaw, 'audio/en-full-b1.mp3': audioRaw };
  const declaration = await call('/atelier/publications', { method: 'POST', headers: bearer, body: { manifest: m, queueItemId: lease.item.id, leaseToken: lease.item.leaseToken } });
  expect(declaration.status, await declaration.clone().text()).toBe(200);
  const declared = await declaration.json<{ publicationId: string; missing: string[] }>();
  for (const path of declared.missing) {
    const f = m.files[path]!;
    const up = await call(`/atelier/publications/${declared.publicationId}/files/${path}`, { method: 'PUT', body: data[path], headers: { ...bearer, 'X-Discover-Lease-Token': lease.item.leaseToken, 'Content-Type': f.contentType, 'Content-Length': String(f.size), 'x-content-sha256': f.sha256 } });
    expect(up.status, await up.text()).toBe(200);
  }
  const commit = await call(`/atelier/publications/${declared.publicationId}/commit`, { method: 'POST', headers: { ...bearer, 'X-Discover-Lease-Token': lease.item.leaseToken } });
  expect(commit.status, await commit.text()).toBe(200);

  // Progression d'écoute de la variante publiée.
  await call('/api/progress', { method: 'PUT', cookie, body: { targetType: 'variant', targetId: `${CONTENT_ID}:en-full-b1`, audioRef: audioSha, positionMs: 30_000, durationMs: 240_000, completed: true } });

  // Données sensibles qui ne doivent jamais sortir : session, tentatives de connexion, push, jeton de bail.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (id, label, created_at, last_seen_at, idle_expires_at, expires_at)
      VALUES ('session-secret-hmac', 'Fold7', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z', '2026-11-18T00:00:00Z', '2027-04-17T00:00:00Z')`),
    env.DB.prepare(`INSERT INTO login_attempts (bucket, window_start, failures)
      VALUES ('ip:secret-bucket', '2026-10-19T00:00:00Z', 2)`),
    env.DB.prepare(`INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, session_id, epoch, created_at, updated_at)
      VALUES ('device-1', 'https://push.example.com/secret-endpoint', 'secret-p256dh', 'secret-auth', 'session-secret-hmac', 'test-epoch', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z')`),
    env.DB.prepare(`UPDATE prepare_queue SET lease_token = 'secret-lease-token', lease_owner = 'mac-secret' WHERE kind = 'dossier'`),
  ]);
}
