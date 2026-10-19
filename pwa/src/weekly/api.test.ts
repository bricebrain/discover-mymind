import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { downloadMarkdown, fetchWeekly, fetchWeeklyMarkdown, weeklyError } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('API hebdomadaire et téléchargement', () => {
  it('demande le bilan de la semaine choisie avec la session existante', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ week: '2026-W43' })));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchWeekly('2026-W43')).toEqual({ week: '2026-W43' });
    expect(fetcher).toHaveBeenCalledWith('/api/weekly?week=2026-W43', expect.objectContaining({ credentials: 'same-origin' }));
  });
  it('récupère le Markdown sans décodage JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('# Ma semaine', { headers: { 'Content-Type': 'text/markdown' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await (await fetchWeeklyMarkdown('2026-W43')).text()).toBe('# Ma semaine');
    expect(fetcher).toHaveBeenCalledWith('/api/weekly/export?week=2026-W43', expect.objectContaining({ credentials: 'same-origin' }));
  });
  it('préserve le code 422 et ne télécharge aucun résultat partiel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'weekly_limit_exceeded', message: 'Limite' } }), { status: 422 })));
    await expect(fetchWeeklyMarkdown('2026-W43')).rejects.toMatchObject({ status: 422, code: 'weekly_limit_exceeded' });
    expect(weeklyError(new ApiError(422, 'weekly_limit_exceeded', 'Limite'))).toContain('Aucun résultat partiel');
  });
  it('signale une rupture réseau et une erreur non JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchWeeklyMarkdown('2026-W43')).rejects.toMatchObject({ code: 'network' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Erreur</html>', { status: 500 })));
    await expect(fetchWeeklyMarkdown('2026-W43')).rejects.toMatchObject({ status: 500, code: 'http_error' });
  });
  it('déclenche le téléchargement avec le nom attendu et libère son URL, sans presse-papiers', () => {
    vi.useFakeTimers();
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    vi.stubGlobal('document', { createElement: () => link, body: { append } });
    const clipboard = vi.fn().mockRejectedValue(new Error('Permission refusée'));
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:weekly');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    downloadMarkdown(new Blob(['# Bilan']), '2026-W43');
    expect(link.download).toBe('discover-weekly-2026-W43.md');
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(clipboard).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:weekly');
  });
});
