import { api } from './client';

export const EXPORT_SECTIONS = [
  ['reflections', 'Mes notes'], ['contents', 'Contenus préparés'], ['dossiers', 'Dossiers'],
  ['shows', 'Émissions suivies'], ['savedEpisodes', 'Épisodes sauvegardés'],
  ['listeningProgress', 'Progression d’écoute'],
] as const;
const COLLECTIONS = [...EXPORT_SECTIONS.map(([key]) => key), 'preparations'] as const;
type Collection = typeof COLLECTIONS[number];
type Collections = Record<Collection, unknown[]>;
interface ExportPage extends Collections {
  schemaVersion: 2; exportedAt: string; audioNotice: string;
  appSettings: { autoPrepareEnabled: boolean };
  pagination: { page: number; hasMore: boolean };
  markdownSections: Record<string, string>;
}
export interface CompleteExport extends Collections {
  schemaVersion: 2; exportedAt: string; audioNotice: string;
  appSettings: ExportPage['appSettings']; markdown: string;
}

/** Assemble les pages dans le navigateur pour limiter le travail de chaque requête Worker. */
export async function fetchCompleteExport(): Promise<CompleteExport> {
  let result: CompleteExport | undefined;
  const sections: Record<string, string[]> = {};
  for (let page = 0; ; page++) {
    const data = await api<ExportPage>(`/api/export?v=2&page=${page}`);
    if (data.schemaVersion !== 2 || data.pagination?.page !== page ||
        typeof data.pagination.hasMore !== 'boolean' || !data.markdownSections ||
        COLLECTIONS.some(key => !Array.isArray(data[key]))) {
      throw new Error('Réponse d’export invalide.');
    }
    result ??= {
      schemaVersion: 2, exportedAt: data.exportedAt, audioNotice: data.audioNotice,
      appSettings: data.appSettings, markdown: '', reflections: [], contents: [], dossiers: [],
      shows: [], savedEpisodes: [], listeningProgress: [], preparations: [],
    };
    for (const key of COLLECTIONS) result[key].push(...data[key]);
    for (const [key, text] of Object.entries(data.markdownSections)) {
      if (text) (sections[key] ??= []).push(text);
    }
    if (!data.pagination.hasMore) break;
  }
  result.markdown = `# Export Discover — ${result.exportedAt.slice(0, 10)}\n\n> ${result.audioNotice}\n\n`
    + EXPORT_SECTIONS.filter(([key]) => sections[key]?.length)
      .map(([key, title]) => `## ${title}\n\n${sections[key]!.join('\n\n---\n\n')}`).join('\n\n') + '\n';
  return result;
}

export async function fetchLegacyExport(): Promise<Blob> {
  const response = await fetch('/api/export?v=1', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Export impossible pour l’instant.');
  return response.blob();
}

export function hasUnavailableFiles(data: CompleteExport): boolean {
  return data.contents.some(value => {
    const content = value as { error: string | null; variants: { segmentsError: string | null }[] };
    return Boolean(content.error || content.variants.some(variant => variant.segmentsError));
  });
}
