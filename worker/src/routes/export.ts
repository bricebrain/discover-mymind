import type { Env } from '../env';
import { HttpError, json } from '../http';
import { manifest } from '../publications/store';
import type { Manifest, Publication, Segment, Segments } from '../publications/types';
import { exportAll } from './reflections';

/**
 * Export complet (lot 12, chantier E) : tout ce qui appartient à l'utilisateur, format schemaVersion 2.
 * L'export v1 (`exportAll`) reste servi tel quel via `?v=1` ; le Markdown lisible via `?v=2&format=markdown`.
 *
 * Jamais exporté : sessions, login_attempts, abonnements push, jetons de bail ou de commit, secrets d'environnement.
 * Les audios ne sont pas dans le JSON : chaque variante liste empreinte SHA-256, taille et chemin de lecture,
 * avec l'avertissement ci-dessous (les URL de lecture exigent la session et disparaissent avec le contenu).
 */
const AUDIO_NOTICE = 'Les fichiers audio ne sont pas inclus dans cet export. Chaque variante indique l’empreinte '
  + 'SHA-256 et la taille de son audio : une sauvegarde réelle consiste à télécharger ces fichiers puis à vérifier '
  + 'leur empreinte. Les adresses de lecture de l’app exigent une session et disparaissent si le contenu est '
  + 'supprimé : ce ne sont pas des sauvegardes.';

// ── My Mind ─────────────────────────────────────────────────────────────────

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
async function loadNotes(env: Env): Promise<NoteOut[]> {
  const [notes, links] = await Promise.all([
    env.DB.prepare('SELECT * FROM reflections ORDER BY created_at').all<NoteRow>(),
    env.DB.prepare('SELECT reflection_id, target_type, target_id, variant_key, segment_id, quote, target_title FROM reflection_links ORDER BY reflection_id, created_at')
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
async function loadShows(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, publisher, source_type, channel_id, feed_url, apple_id, image_url, language, category,
       title_filter_json, auto_prepare, auto_preset, auto_level, enabled, created_at FROM shows ORDER BY id`,
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

async function loadSavedEpisodes(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.show_id, e.title, e.audio_url, e.published_at, e.video_id, s.title AS show
       FROM episodes e JOIN shows s ON s.id = e.show_id WHERE e.state = 'saved' ORDER BY e.published_at DESC`,
  ).all<{ id: string; show_id: string; title: string; audio_url: string; published_at: string | null; video_id: string | null; show: string }>();
  return results.map((e) => ({
    id: e.id, showId: e.show_id, title: e.title, show: e.show, audioUrl: e.audio_url,
    publishedAt: e.published_at, videoId: e.video_id,
  }));
}

async function loadProgress(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT target_type, target_id, audio_ref, position_ms, duration_ms, completed, updated_at FROM listening_progress ORDER BY updated_at',
  ).all<{ target_type: string; target_id: string; audio_ref: string; position_ms: number; duration_ms: number | null; completed: number; updated_at: string }>();
  return results.map((p) => ({
    targetType: p.target_type, targetId: p.target_id, audioRef: p.audio_ref, positionMs: p.position_ms,
    durationMs: p.duration_ms, completed: p.completed === 1, updatedAt: p.updated_at,
  }));
}

/** File des préparations : statut, options, dates — jamais les jetons de bail ni leur propriétaire. */
async function loadPreparations(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, kind, ref, options_json, status, stage, attempts, max_attempts, content_id, error, created_at, updated_at
       FROM prepare_queue ORDER BY created_at DESC LIMIT 500`,
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

async function loadAppSettings(env: Env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM app_settings').all<{ key: string; value: string }>();
  const values = new Map(results.map((r) => [r.key, r.value]));
  return { autoPrepareEnabled: values.get('auto_prepare_enabled') !== '0' };
}

// ── Contenus préparés (publication courante, via le manifeste R2) ───────────

export interface ExportAudio {
  origin: string; source: string; durationMs: number; timingSource: string;
  sha256: string | null; sizeBytes: number | null; streamUrl: string | null; playbackPath: string | null;
}
export interface ExportVariant {
  key: string; kind: string; language: string; cefrLevel: string | null; style: string | null;
  derivedFrom: string | null; coverage: string; timingStatus: string | null;
  audio: ExportAudio | null; segments: Segment[] | null; segmentsError: string | null;
}
export interface ExportContent {
  id: string; title: string; originalLanguage: string; sourceType: string; sourceRef: string | null;
  sourceUrl: string | null; category: string | null; editorial: string; createdAt: string; updatedAt: string;
  sources: Manifest['content']['sources'] | null; publication: { id: string; revision: string; seq: number; publishedAt: string };
  variants: ExportVariant[]; files: { path: string; sha256: string; size: number; contentType: string }[];
  error: string | null;
}

/**
 * Contenus visibles et leur publication courante : métadonnées, variantes avec leurs segments complets
 * (texte, traduction, provenance), et fichiers avec empreinte et taille. Un manifeste ou des segments
 * indisponibles n'interrompent pas l'export : le contenu est exporté avec une erreur explicite.
 */
async function loadContents(env: Env): Promise<ExportContent[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.title, c.original_language, c.source_type, c.source_ref, c.source_url, c.category, c.editorial,
            c.created_at, c.updated_at, p.id AS publication_id, p.revision, p.seq, p.manifest_r2_key, p.created_at AS published_at
       FROM contents c JOIN publications p ON p.id = c.current_publication_id
      WHERE c.deleted_at IS NULL AND p.status = 'ready' ORDER BY c.created_at`,
  ).all<{
    id: string; title: string; original_language: string; source_type: string; source_ref: string | null; source_url: string | null;
    category: string | null; editorial: string; created_at: string; updated_at: string;
    publication_id: string; revision: string; seq: number; manifest_r2_key: string; published_at: string;
  }>();
  const timing = new Map<string, string>();
  for (const v of (await env.DB.prepare('SELECT publication_id, variant_key, timing_status FROM variants')
    .all<{ publication_id: string; variant_key: string; timing_status: string }>()).results) {
    timing.set(`${v.publication_id}/${v.variant_key}`, v.timing_status);
  }
  const contents: ExportContent[] = [];
  for (const c of results) {
    const entry: ExportContent = {
      id: c.id, title: c.title, originalLanguage: c.original_language, sourceType: c.source_type, sourceRef: c.source_ref,
      sourceUrl: c.source_url, category: c.category, editorial: c.editorial, createdAt: c.created_at, updatedAt: c.updated_at,
      sources: null, publication: { id: c.publication_id, revision: c.revision, seq: c.seq, publishedAt: c.published_at },
      variants: [], files: [], error: null,
    };
    contents.push(entry);
    let m: Manifest;
    try {
      const p: Publication = {
        id: c.publication_id, content_id: c.id, revision: c.revision, seq: c.seq, status: 'ready',
        manifest_r2_key: c.manifest_r2_key, queue_item_id: null, lease_token: null, commit_token: null,
      };
      m = await manifest(env, p);
    } catch {
      entry.error = 'manifest_unavailable';
      continue;
    }
    entry.sources = m.content.sources ?? null;
    entry.files = Object.entries(m.files).map(([path, f]) => ({ path, sha256: f.sha256, size: f.size, contentType: f.contentType }));
    for (const v of m.variants) {
      const audioFile = v.audio?.source === 'r2' && v.audio.file ? m.files[v.audio.file] : undefined;
      entry.variants.push({
        key: v.key, kind: v.kind, language: v.language, cefrLevel: v.cefrLevel ?? null, style: v.style ?? null,
        derivedFrom: v.derivedFrom ?? null, coverage: v.coverage ?? 'full',
        timingStatus: timing.get(`${c.publication_id}/${v.key}`) ?? null,
        audio: v.audio ? {
          origin: v.audio.origin, source: v.audio.source, durationMs: v.audio.durationMs, timingSource: v.audio.timingSource,
          sha256: audioFile?.sha256 ?? null, sizeBytes: audioFile?.size ?? null,
          streamUrl: v.audio.source === 'publisher_stream' ? v.audio.url ?? null : null,
          playbackPath: v.audio.source === 'r2' ? `/api/contents/${c.id}/variants/${v.key}/audio?publication=${c.publication_id}` : null,
        } : null,
        segments: null, segmentsError: null,
      });
      const variant = entry.variants[entry.variants.length - 1]!;
      const file = m.files[v.segmentsFile];
      if (!file) { variant.segmentsError = 'file_missing'; continue; }
      try {
        const obj = await env.FILES.get(`blobs/${file.sha256}`);
        if (!obj) { variant.segmentsError = 'file_missing'; continue; }
        variant.segments = (await obj.json<Segments>()).segments ?? [];
      } catch {
        variant.segmentsError = 'unreadable';
      }
    }
  }
  return contents;
}

// ── Dossiers multisources ───────────────────────────────────────────────────

export interface ExportDossier {
  id: string; title: string; version: number; createdAt: string; updatedAt: string;
  sources: unknown[];
  runs: { id: string; version: number; title: string; sources: unknown[]; options: unknown; createdAt: string;
    preparation: { status: string; contentId: string | null } | null }[];
}

async function loadDossiers(env: Env): Promise<ExportDossier[]> {
  const [ds, runs] = await Promise.all([
    env.DB.prepare('SELECT * FROM dossiers ORDER BY created_at').all<{ id: string; title: string; version: number; sources_json: string; created_at: string; updated_at: string }>(),
    env.DB.prepare(
      `SELECT r.id, r.dossier_id, r.version, r.title, r.sources_json, r.options_json, r.created_at,
              q.status AS queue_status, q.content_id AS queue_content_id
         FROM dossier_runs r LEFT JOIN prepare_queue q
           ON q.id = (SELECT id FROM prepare_queue WHERE kind = 'dossier' AND ref = r.id ORDER BY created_at DESC LIMIT 1)
        ORDER BY r.created_at`,
    ).all<{ id: string; dossier_id: string; version: number; title: string; sources_json: string; options_json: string; created_at: string; queue_status: string | null; queue_content_id: string | null }>(),
  ]);
  const byDossier = new Map<string, typeof runs.results>();
  for (const r of runs.results) byDossier.set(r.dossier_id, [...(byDossier.get(r.dossier_id) ?? []), r]);
  return ds.results.map((d) => ({
    id: d.id, title: d.title, version: d.version, createdAt: d.created_at, updatedAt: d.updated_at,
    sources: JSON.parse(d.sources_json) as unknown[],
    runs: (byDossier.get(d.id) ?? []).map((r) => ({
      id: r.id, version: r.version, title: r.title, sources: JSON.parse(r.sources_json) as unknown[],
      options: JSON.parse(r.options_json) as unknown, createdAt: r.created_at,
      preparation: r.queue_status ? { status: r.queue_status, contentId: r.queue_content_id } : null,
    })),
  }));
}

// ── Markdown lisible ────────────────────────────────────────────────────────

const mo = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(bytes / 1000))} ko`;
function minutes(ms: number): string {
  const total = Math.round(ms / 1000), m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function noteMarkdown(r: NoteOut): string {
  const head = [
    `# ${r.title || 'Sans titre'}`, '',
    `_${r.kind} · créée le ${r.createdAt.slice(0, 10)} · modifiée le ${r.updatedAt.slice(0, 10)}${r.tags.length ? ` · ${r.tags.map((t) => `#${t}`).join(' ')}` : ''}_`, '',
  ];
  if (r.origin === 'article') head.push(`Article${r.sourceName ? ` · ${r.sourceName}` : ''}${r.sourceUrl ? ` · ${r.sourceUrl}` : ''}`, '');
  if (r.deletedAt) head.push(`> _Note en corbeille depuis le ${r.deletedAt.slice(0, 10)}._`, '');
  const tail = r.links.length ? ['', '**Sources :**', ...r.links.map((l) => `- ${l.targetTitle}${l.quote ? ` — « ${l.quote} »` : ''}`)] : [];
  return [...head, r.body, ...tail].join('\n');
}

const KINDS_FR: Record<string, string> = { source: 'transcription source', faithful_translation: 'traduction fidèle', adaptation: 'adaptation' };
function variantTitle(v: ExportVariant): string {
  const langue = v.language === 'en' ? 'anglais' : v.language === 'fr' ? 'français' : v.language;
  return `${v.key} — ${KINDS_FR[v.kind] ?? v.kind} (${langue}${v.cefrLevel ? `, ${v.cefrLevel}` : ''}${v.style ? `, ${v.style}` : ''})`;
}
function variantMarkdown(v: ExportVariant): string {
  const lines = [`#### ${variantTitle(v)}`, ''];
  if (v.audio) {
    lines.push(v.audio.source === 'r2'
      ? `_Audio : ${v.audio.sizeBytes != null ? `${mo(v.audio.sizeBytes)} · ` : ''}${v.audio.origin} · ${minutes(v.audio.durationMs)} — SHA-256 \`${v.audio.sha256 ?? '?'}\` (fichier non inclus, voir l’avertissement)._`
      : `_Audio : flux officiel de l’éditeur — ${v.audio.streamUrl ?? '?'}_`, '');
  }
  if (v.segmentsError) return [...lines, `_Segments indisponibles (${v.segmentsError})._`].join('\n');
  if (!v.segments?.length) return [...lines, '_Aucun segment._'].join('\n');
  return [...lines, v.segments.map((s) => {
    const out = [s.speaker ? `**${s.speaker} :** ${s.text}` : s.text];
    if (s.fr) out.push('', `> ${s.fr.replace(/\n/g, ' ')}`);
    return out.join('\n');
  }).join('\n\n')].join('\n');
}

function contentMarkdown(c: ExportContent): string {
  const head = [
    `### ${c.title}`, '',
    `_${c.sourceType} · langue d’origine ${c.originalLanguage} · créé le ${c.createdAt.slice(0, 10)}${c.sourceUrl ? ` · ${c.sourceUrl}` : ''}_`, '',
  ];
  if (c.error) return [...head, `_Publication indisponible (${c.error}) : manifeste inaccessible._`].join('\n');
  return [...head, c.variants.map(variantMarkdown).join('\n\n')].join('\n');
}

function dossierMarkdown(d: ExportDossier): string {
  const lines = [`### ${d.title}`, '', `_version courante ${d.version} · créé le ${d.createdAt.slice(0, 10)} · modifié le ${d.updatedAt.slice(0, 10)}_`, ''];
  const source = (s: { id?: string; type?: string; ref?: string; title?: string }) =>
    `- ${s.id ?? '?'} · ${s.type ?? '?'} « ${s.title ?? s.ref ?? '?'} »${s.ref ? ` (${s.type}:${s.ref})` : ''}`;
  if (d.sources.length) lines.push('Sources :', ...(d.sources as { id?: string; type?: string; ref?: string; title?: string }[]).map(source), '');
  for (const r of d.runs) {
    lines.push(`#### Exécution du ${r.createdAt.slice(0, 10)} (version ${r.version})${r.preparation ? ` — préparation ${r.preparation.status}` : ''}`, '');
    const captured = r.sources as { id?: string; type?: string; ref?: string; title?: string; capturedAt?: string }[];
    if (captured.length) lines.push('Sources capturées :', ...captured.map((s) => `${source(s)}${s.capturedAt ? ` — capture du ${s.capturedAt.slice(0, 10)}` : ''}`), '');
    lines.push(`Options : \`${JSON.stringify(r.options)}\``, '');
  }
  return lines.join('\n');
}

/** Document complet : notes, contenus préparés (anglais + traduction par paragraphe), dossiers, puis annexes. */
function buildMarkdown(data: {
  notes: NoteOut[]; contents: ExportContent[]; dossiers: ExportDossier[];
  shows: Awaited<ReturnType<typeof loadShows>>; saved: Awaited<ReturnType<typeof loadSavedEpisodes>>; progress: Awaited<ReturnType<typeof loadProgress>>;
}): string {
  const date = new Date().toISOString().slice(0, 10);
  const out = [`# Export Discover — ${date}`, '', `> ${AUDIO_NOTICE}`];
  if (data.notes.length) out.push('', '## Mes notes', '', data.notes.map(noteMarkdown).join('\n\n---\n\n'));
  if (data.contents.length) out.push('', '## Contenus préparés', '', data.contents.map(contentMarkdown).join('\n\n---\n\n'));
  if (data.dossiers.length) out.push('', '## Dossiers', '', data.dossiers.map(dossierMarkdown).join('\n\n---\n\n'));
  if (data.shows.length) {
    out.push('', '## Émissions suivies', '', ...data.shows.map((s) =>
      `- ${s.title}${s.publisher ? ` (${s.publisher})` : ''} — ${s.sourceType}${s.channelId ? ` · chaîne ${s.channelId}` : ''} · ${s.language} · ${s.category}${s.enabled ? '' : ' · désactivée'}`));
  }
  if (data.saved.length) {
    out.push('', '## Épisodes sauvegardés', '', ...data.saved.map((e) =>
      `- ${e.title} — ${e.show}${e.publishedAt ? ` · publié le ${e.publishedAt.slice(0, 10)}` : ''} — ${e.audioUrl}`));
  }
  if (data.progress.length) {
    out.push('', '## Progression d’écoute', '', ...data.progress.map((p) =>
      `- ${p.targetType === 'episode' ? 'épisode' : 'variante'} ${p.targetId} : ${minutes(p.positionMs)}${p.durationMs ? ` / ${minutes(p.durationMs)}` : ''}${p.completed ? ' (terminé)' : ''}`));
  }
  return out.join('\n') + '\n';
}

// ── Route ───────────────────────────────────────────────────────────────────

/** GET /api/export — v2 par défaut ; ?v=1 sert l'export historique tel quel ; ?v=2&format=markdown le document seul. */
export async function exportData(req: Request, env: Env): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const version = params.get('v') ?? '2';
  if (version === '1') return exportAll(env);
  if (version !== '2') throw new HttpError(400, 'invalid_version', 'Version d’export inconnue (1 ou 2).');
  const [reflections, shows, savedEpisodes, listeningProgress, preparations, contents, dossiers, appSettings] = await Promise.all([
    loadNotes(env), loadShows(env), loadSavedEpisodes(env), loadProgress(env), loadPreparations(env), loadContents(env), loadDossiers(env), loadAppSettings(env),
  ]);
  const exportedAt = new Date().toISOString();
  const date = exportedAt.slice(0, 10);
  if (params.get('format') === 'markdown') {
    const markdown = buildMarkdown({ notes: reflections, contents, dossiers, shows, saved: savedEpisodes, progress: listeningProgress });
    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="discover-export-${date}.md"`,
      },
    });
  }
  return json({
    schemaVersion: 2, exportedAt, audioNotice: AUDIO_NOTICE,
    reflections, shows, savedEpisodes, listeningProgress, preparations, contents, dossiers, appSettings,
    markdown: buildMarkdown({ notes: reflections, contents, dossiers, shows, saved: savedEpisodes, progress: listeningProgress }),
  }, 200, { 'Content-Disposition': `attachment; filename="discover-export-${date}.json"` });
}
