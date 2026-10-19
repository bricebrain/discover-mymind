import type { NoteOut, loadShows, loadSavedEpisodes, loadProgress } from './data';
import type { ExportVariant, ExportContent } from './contents';
import type { ExportDossier } from './dossiers';
import { AUDIO_NOTICE } from './constants';

const SECTION_TITLES: Record<string, string> = { reflections: 'Mes notes', contents: 'Contenus préparés', dossiers: 'Dossiers', shows: 'Émissions suivies', savedEpisodes: 'Épisodes sauvegardés', listeningProgress: 'Progression d’écoute' };

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
    for (const s of r.sources as { title?: string; text?: string; segments?: { text: string; fr?: string }[] }[]) {
      if (s.text || s.segments?.length) lines.push(`##### ${s.title ?? 'Source'}`, '', s.text ?? s.segments!.map(p => p.text + (p.fr ? `\n\n> ${p.fr}` : '')).join('\n\n'), '');
    }
    lines.push(`Options : \`${JSON.stringify(r.options)}\``, '');
  }
  return lines.join('\n');
}

/** Document complet : notes, contenus préparés (anglais + traduction par paragraphe), dossiers, puis annexes. */
export interface MarkdownData {
  notes: NoteOut[]; contents: ExportContent[]; dossiers: ExportDossier[];
  shows: Awaited<ReturnType<typeof loadShows>>; saved: Awaited<ReturnType<typeof loadSavedEpisodes>>; progress: Awaited<ReturnType<typeof loadProgress>>;
}

export function buildMarkdown(data: MarkdownData): string {
  const sections = markdownSections(data);
  return `# Export Discover — ${new Date().toISOString().slice(0, 10)}\n\n> ${AUDIO_NOTICE}\n\n` + Object.entries(sections).map(([key, text]) => `## ${SECTION_TITLES[key]}\n\n${text}`).join('\n\n') + '\n';
}

export function markdownSections(data: MarkdownData): Record<string, string> {
  const out: Record<string, string> = {};
  if (data.notes.length) out.reflections = data.notes.map(noteMarkdown).join('\n\n---\n\n');
  if (data.contents.length) out.contents = data.contents.map(contentMarkdown).join('\n\n---\n\n');
  if (data.dossiers.length) out.dossiers = data.dossiers.map(dossierMarkdown).join('\n\n---\n\n');
  if (data.shows.length) {
    out.shows = data.shows.map((s) =>
      `- ${s.title}${s.publisher ? ` (${s.publisher})` : ''} — ${s.sourceType}${s.channelId ? ` · chaîne ${s.channelId}` : ''} · ${s.language} · ${s.category}${s.enabled ? '' : ' · désactivée'}`).join('\n');
  }
  if (data.saved.length) {
    out.savedEpisodes = data.saved.map((e) =>
      `- ${e.title} — ${e.show}${e.publishedAt ? ` · publié le ${e.publishedAt.slice(0, 10)}` : ''} — ${e.audioUrl}`).join('\n');
  }
  if (data.progress.length) {
    out.listeningProgress = data.progress.map((p) =>
      `- ${p.targetType === 'episode' ? 'épisode' : 'variante'} ${p.targetId} : ${minutes(p.positionMs)}${p.durationMs ? ` / ${minutes(p.durationMs)}` : ''}${p.completed ? ' (terminé)' : ''}`).join('\n');
  }
  return out;
}

