import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/publications/validation';
import type { Manifest, Segments } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, PASSPHRASE, call, login } from './helpers';

/**
 * Export complet (chantier E) : le format v2 doit contenir notes (corbeille incluse), progression,
 * contenus préparés avec leurs segments, dossiers — et jamais le moindre secret.
 * L'export v1 reste servi tel quel via ?v=1.
 */
const bearer = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const EP = 'a1b2c3d4e5f6a7b8c9d0';
const CONTENT_ID = 'note-export-test';
const CHANNEL = 'UC1234567890123456789012';

const bytes = (t: string) => new TextEncoder().encode(t).length;
let cookie = '';
let audioSha = '';
let dossierId = '';

interface Variant {
  key: string; kind: string; language: string; cefrLevel: string | null; timingStatus: string | null;
  audio: { origin: string; source: string; sha256: string | null; sizeBytes: number | null; playbackPath: string | null; streamUrl: string | null } | null;
  segments: { text: string; fr?: string }[] | null; segmentsError: string | null;
}
interface ExportPayload {
  schemaVersion: number; audioNotice: string;
  reflections: { id: string; origin: string; sourceName: string | null; sourceUrl: string | null; deletedAt: string | null; body: string; links: { targetTitle: string; quote: string | null }[] }[];
  shows: { id: string; sourceType: string; channelId: string | null; feedUrl: string; autoPrepare: boolean; enabled: boolean }[];
  savedEpisodes: { id: string; title: string; show: string; audioUrl: string }[];
  listeningProgress: { targetType: string; targetId: string; positionMs: number; completed: boolean }[];
  preparations: { kind: string; status: string; options: { coverage?: string; level?: string }; contentId: string | null; error: string | null }[];
  contents: { id: string; title: string; sourceType: string; publication: { id: string; revision: string }; variants: Variant[]; files: { path: string; sha256: string; size: number }[]; error: string | null }[];
  dossiers: { id: string; title: string; sources: unknown[]; runs: { sources: { id: string }[]; options: Record<string, unknown>; preparation: { status: string; contentId: string | null } | null }[] }[];
  appSettings: { autoPrepareEnabled: boolean };
  markdown: string;
}

beforeEach(async () => {
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
  const enDoc: Segments = { schemaVersion: 1, variantKey: 'en-full-b1', segments: [
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
      { key: 'en-full-b1', kind: 'adaptation', language: 'en', cefrLevel: 'B1', style: 'narration', derivedFrom: 'fr-source', coverage: 'full', segmentsFile: 'segments/en-full-b1.json', evaluation: { verdict: 'ok' }, audio: { source: 'r2', file: 'audio/en-full-b1.mp3', origin: 'kokoro', durationMs: 4000, timingSource: 'kokoro' } },
    ],
    files: {
      'segments/fr-source.json': { sha256: await sha256Hex(sourceRaw), size: bytes(sourceRaw), contentType: 'application/json' },
      'segments/en-full-b1.json': { sha256: await sha256Hex(enRaw), size: bytes(enRaw), contentType: 'application/json' },
      'audio/en-full-b1.mp3': { sha256: audioSha, size: bytes(audioRaw), contentType: 'audio/mpeg' },
    },
    removeVariants: [],
  };
  const data: Record<string, string> = { 'segments/fr-source.json': sourceRaw, 'segments/en-full-b1.json': enRaw, 'audio/en-full-b1.mp3': audioRaw };
  const declared = await (await call('/atelier/publications', { method: 'POST', headers: bearer, body: { manifest: m, queueItemId: lease.item.id, leaseToken: lease.item.leaseToken } })).json<{ publicationId: string; missing: string[] }>();
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
});

const fetchExport = async (query = '') => (await call(`/api/export${query}`, { cookie })).json<ExportPayload>();

describe('export v2', () => {
  it('contient les notes (corbeille marquée, articles avec leur source), les émissions YouTube et la progression', async () => {
    const data = await fetchExport();
    expect(data.schemaVersion).toBe(2);
    expect(data.reflections).toHaveLength(4);
    const article = data.reflections.find((r) => r.origin === 'article');
    expect(article).toMatchObject({ sourceName: 'Le Monde', sourceUrl: 'https://www.lemonde.fr/economie/article.html' });
    expect(article!.links[0]).toMatchObject({ targetTitle: 'La dette américaine — Code source', quote: 'le dollar reste dominant' });
    expect(data.reflections.find((r) => r.deletedAt !== null)).toBeTruthy();
    const youtube = data.shows.find((s) => s.id === 'yt');
    expect(youtube).toMatchObject({ sourceType: 'youtube', channelId: CHANNEL, feedUrl: expect.stringContaining('youtube.com') });
    expect(data.savedEpisodes[0]).toMatchObject({ id: EP, title: 'La dette américaine', audioUrl: 'https://cdn.example.com/a.mp3' });
    expect(data.listeningProgress).toHaveLength(2);
    expect(data.listeningProgress.find((p) => p.targetType === 'episode')).toMatchObject({ targetId: EP, positionMs: 61_000, completed: false });
    expect(data.listeningProgress.find((p) => p.targetType === 'variant')).toMatchObject({ targetId: `${CONTENT_ID}:en-full-b1`, completed: true });
    expect(data.appSettings).toEqual({ autoPrepareEnabled: true });
  });

  it('contient les contenus préparés : variantes, segments traduits, audio avec empreinte et taille', async () => {
    const data = await fetchExport();
    const content = data.contents.find((c) => c.id === CONTENT_ID);
    expect(content).toMatchObject({ title: 'Ma note préparée', sourceType: 'reflection' });
    expect(content!.publication.revision).toBeTruthy();
    expect(content!.files).toHaveLength(3);
    const en = content!.variants.find((v) => v.key === 'en-full-b1');
    expect(en).toMatchObject({ kind: 'adaptation', timingStatus: 'exact' });
    expect(en!.segments).toHaveLength(2);
    expect(en!.segments![0]).toMatchObject({ text: 'The adapted English paragraph.', fr: 'Le paragraphe anglais adapté.' });
    expect(en!.audio).toMatchObject({ origin: 'kokoro', source: 'r2', sha256: audioSha, sizeBytes: expect.any(Number) });
    expect(en!.audio!.playbackPath).toBe(`/api/contents/${CONTENT_ID}/variants/en-full-b1/audio?publication=${content!.publication.id}`);
    expect(en!.audio!.playbackPath).not.toMatch(/^https?:\/\//); // chemin relatif : jamais présenté comme une sauvegarde
    const fr = content!.variants.find((v) => v.key === 'fr-source');
    expect(fr!.audio).toBeNull();
    expect(fr!.segments![0]!.text).toContain('paragraphe source');
  });

  it('contient les dossiers avec leurs exécutions, et la file des préparations sans jetons', async () => {
    const data = await fetchExport();
    const dossier = data.dossiers.find((d) => d.id === dossierId);
    expect(dossier).toMatchObject({ title: 'Dette publique' });
    expect(dossier!.sources).toHaveLength(2);
    expect(dossier!.runs).toHaveLength(1);
    expect(dossier!.runs[0]!.sources.map((s) => s.id)).toEqual(['d1', 'd2']);
    expect(dossier!.runs[0]!.options).toMatchObject({ coverage: 'condensed', level: 'B1' });
    expect(dossier!.runs[0]!.preparation).toMatchObject({ status: 'pending', contentId: null });
    expect(data.preparations.some((p) => p.kind === 'dossier' && p.options.coverage === 'condensed')).toBe(true);
    expect(data.preparations.some((p) => p.kind === 'reflection' && p.status === 'done' && p.contentId === CONTENT_ID)).toBe(true);
  });

  it('ne contient aucun secret (sessions, connexions, push, jetons de bail)', async () => {
    const payload = await (await call('/api/export', { cookie })).json<Record<string, unknown>>();
    const text = JSON.stringify(payload);
    expect(Object.keys(payload).sort()).toEqual(['appSettings', 'audioNotice', 'contents', 'dossiers', 'exportedAt', 'listeningProgress', 'markdown', 'preparations', 'reflections', 'savedEpisodes', 'schemaVersion', 'shows'].sort());
    for (const secret of ['session-secret-hmac', 'secret-bucket', 'secret-endpoint', 'secret-p256dh', 'secret-auth', 'secret-lease-token', 'mac-secret', ATELIER_TOKEN, PASSPHRASE]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/lease_token|leaseToken|lease_owner|leaseOwner|p256dh|login_attempts|loginAttempts|push_subscriptions|pushSubscriptions|session_id|sessionId/);
  });

  it('embarque un avertissement explicite sur les audios non inclus', async () => {
    const data = await fetchExport();
    expect(data.audioNotice).toContain('ne sont pas inclus');
    expect(data.audioNotice).toContain('SHA-256');
    expect(data.audioNotice).toContain('ce ne sont pas des sauvegardes');
  });

  it('mesure la taille produite (documentation des limites CPU du Worker gratuit)', async () => {
    const text = await (await call('/api/export', { cookie })).text();
    console.log(JSON.stringify({ event: 'export_size', bytes: text.length, kiloBytes: Math.round(text.length / 1024) }));
    expect(text.length).toBeGreaterThan(2000);
  });
});

describe('export v1 (inchangé)', () => {
  it('reste servi tel quel via ?v=1, sans les nouvelles sections', async () => {
    const res = await call('/api/export?v=1', { cookie });
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="discover-export-\d{4}-\d{2}-\d{2}\.json"/);
    const data = await res.json<Record<string, unknown>>();
    expect(Object.keys(data).sort()).toEqual(['exportedAt', 'markdown', 'reflections', 'savedEpisodes', 'schemaVersion', 'shows'].sort());
    expect(data.schemaVersion).toBe(1);
    expect((data.reflections as unknown[])).toHaveLength(3); // la corbeille reste exclue du v1
  });

  it('refuse une version inconnue', async () => {
    expect((await call('/api/export?v=3', { cookie })).status).toBe(400);
  });
});

describe('export Markdown', () => {
  it('se lit sans outil : notes, contenus bilingues, dossiers, annexes, avertissement audio', async () => {
    const res = await call('/api/export?v=2&format=markdown', { cookie });
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="discover-export-\d{4}-\d{2}-\d{2}\.md"/);
    const md = await res.text();
    expect(md).toContain('# Export Discover —');
    expect(md).toContain('## Mes notes');
    expect(md).toContain('Article · Le Monde');
    expect(md).toContain('Note en corbeille depuis le');
    expect(md).toContain('le dollar reste dominant');
    expect(md).toContain('## Contenus préparés');
    expect(md).toContain('#### en-full-b1 — adaptation (anglais, B1, narration)');
    expect(md).toContain('The adapted English paragraph.');
    expect(md).toContain('> Le paragraphe anglais adapté.');
    expect(md).toContain('#### fr-source — transcription source (français)');
    expect(md).toContain(`SHA-256 \`${audioSha}\``);
    expect(md).toContain('## Dossiers');
    expect(md).toContain('Sources capturées :');
    expect(md).toContain('## Émissions suivies');
    expect(md).toContain('Chaîne tech');
    expect(md).toContain('## Progression d’écoute');
    expect(md).toContain('ce ne sont pas des sauvegardes');
    // Le Markdown embarqué dans le JSON est le même document.
    const data = await fetchExport();
    expect(data.markdown).toBe(md);
  });
});
