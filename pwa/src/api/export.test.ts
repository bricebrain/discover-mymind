import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { fetchCompleteExport, hasUnavailableFiles } from './export';

vi.mock('./client', () => ({ api: vi.fn() }));
const request = vi.mocked(api);
const makePage = (page: number, hasMore = false) => ({
  schemaVersion: 2, exportedAt: '2026-10-19T12:00:00Z', audioNotice: 'Audios non inclus.',
  appSettings: { autoPrepareEnabled: true }, pagination: { page, hasMore },
  reflections: [], contents: [], dossiers: [], shows: [], savedEpisodes: [], listeningProgress: [], preparations: [], dictationAttempts: [], listeningReviews: [],
  markdownSections: {},
});

beforeEach(() => request.mockReset());

describe('assemblage de l’export complet', () => {
  it('assemble toutes les pages et garde les notes avant les contenus et les dossiers', async () => {
    request.mockResolvedValueOnce({ ...makePage(0, true),
      reflections: [{ id: 'n1', origin: 'article', sourceName: 'Journal' }],
      contents: [{ id: 'c1', error: null, variants: [] }], preparations: [{ id: 'q1' }], dictationAttempts: [{ id: 'a1' }], listeningReviews: [{ content_id: 'c1' }],
      markdownSections: { reflections: 'Première note', contents: 'English text\n\n> Texte français' },
    }).mockResolvedValueOnce({ ...makePage(1), reflections: [{ id: 'n2' }],
      dossiers: [{ id: 'd1' }], preparations: [{ id: 'q2' }],
      markdownSections: { reflections: 'Deuxième note', dossiers: 'Sources capturées' },
    });
    const data = await fetchCompleteExport();
    expect(request.mock.calls.map(([url]) => url)).toEqual(['/api/export?v=2&page=0', '/api/export?v=2&page=1']);
    expect(data.reflections).toHaveLength(2);
    expect(data.dictationAttempts).toEqual([{ id: 'a1' }]);
    expect(data.listeningReviews).toEqual([{ content_id: 'c1' }]);
    expect(data.preparations).toEqual([{ id: 'q1' }, { id: 'q2' }]);
    expect(data).not.toHaveProperty('pagination');
    expect(data).not.toHaveProperty('markdownSections');
    expect(data.markdown.indexOf('Deuxième note')).toBeLessThan(data.markdown.indexOf('## Contenus préparés'));
    expect(data.markdown.indexOf('## Contenus préparés')).toBeLessThan(data.markdown.indexOf('## Dossiers'));
    expect(data.markdown).toContain('> Texte français');
    expect(hasUnavailableFiles(data)).toBe(false);
  });

  it('produit aussi un document lisible pour un compte vide', async () => {
    request.mockResolvedValueOnce(makePage(0));
    const data = await fetchCompleteExport();
    expect(data.markdown).toContain('# Export Discover — 2026-10-19');
    expect(data.reflections).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('ne retourne aucun export partiel si une page échoue', async () => {
    request.mockResolvedValueOnce(makePage(0, true)).mockRejectedValueOnce(new Error('Connexion interrompue'));
    await expect(fetchCompleteExport()).rejects.toThrow('Connexion interrompue');
  });

  it('refuse une pagination incohérente au lieu de boucler', async () => {
    request.mockResolvedValueOnce(makePage(1, true));
    await expect(fetchCompleteExport()).rejects.toThrow('Réponse d’export invalide');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('signale à l’interface les manifestes ou segments manquants', async () => {
    request.mockResolvedValueOnce({ ...makePage(0), contents: [{ id: 'c1', error: null, variants: [{ segmentsError: 'file_missing' }] }] });
    expect(hasUnavailableFiles(await fetchCompleteExport())).toBe(true);
    request.mockResolvedValueOnce({ ...makePage(0), contents: [{ id: 'c1', error: 'manifest_unavailable', variants: [] }] });
    expect(hasUnavailableFiles(await fetchCompleteExport())).toBe(true);
  });
});
