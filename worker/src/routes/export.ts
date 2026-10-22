import type { Env } from '../env';
import { HttpError, json } from '../http';
import { exportAll } from './reflections';
import { AUDIO_NOTICE } from '../export/constants';
import { loadNotes, loadShows, loadSavedEpisodes, loadProgress, loadPreparations, loadAppSettings, loadDictationAttempts, loadListeningReviews } from '../export/data';
import { loadContents } from '../export/contents';
import { loadDossiers } from '../export/dossiers';
import { buildMarkdown, markdownSections } from '../export/markdown';

/** Sans paramètre : v1 historique. Le format complet utilise explicitement ?v=2. */
export async function exportData(req: Request, env: Env): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const version = params.get('v') ?? '1';
  if (version === '1') return exportAll(env);
  if (version !== '2') throw new HttpError(400, 'invalid_version', 'Version d’export inconnue (1 ou 2).');
  const pageParam = params.get('page');
  const page = pageParam === null ? undefined : { index: Number(pageParam), size: 50 };
  if (page && (!/^\d+$/.test(pageParam!) || !Number.isSafeInteger(page.index) || page.index > 1_000_000)) {
    throw new HttpError(400, 'invalid_page', 'Page d’export invalide.');
  }
  if (params.has('format') && params.get('format') !== 'markdown' && params.get('format') !== 'json') {
    throw new HttpError(400, 'invalid_format', 'Format d’export inconnu.');
  }
  if (page && params.get('format') === 'markdown') throw new HttpError(400, 'invalid_format', 'Utiliser le JSON pour les pages d’export.');
  const [reflections, shows, savedEpisodes, listeningProgress, preparations, contents, dossiers, appSettings, dictationAttempts, listeningReviews] = await Promise.all([
    loadNotes(env, page), loadShows(env, page), loadSavedEpisodes(env, page), loadProgress(env, page), loadPreparations(env, page), loadContents(env, page), loadDossiers(env, page), loadAppSettings(env), loadDictationAttempts(env, page), loadListeningReviews(env, page),
  ]);
  const markdownData = { notes: reflections, contents, dossiers, shows, saved: savedEpisodes, progress: listeningProgress };
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
    ...(page ? { pagination: { page: page.index, hasMore: contents.length === 1 || dossiers.length === 1 || [reflections, shows, savedEpisodes, listeningProgress, preparations, dictationAttempts, listeningReviews].some(items => items.length === page.size) }, markdownSections: markdownSections(markdownData) } : {}),
    reflections, shows, savedEpisodes, listeningProgress, preparations, contents, dossiers, appSettings, dictationAttempts, listeningReviews,
    ...(!page ? { markdown: buildMarkdown(markdownData) } : {}),
  }, 200, { 'Content-Disposition': `attachment; filename="discover-export-${date}.json"` });
}
