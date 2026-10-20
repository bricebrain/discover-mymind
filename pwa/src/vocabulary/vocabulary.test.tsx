// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WordPicksList } from './WordPicksList';
import { WordPickSheet } from './WordPickSheet';
import { validWordPick } from './validation';
import { saveWordPick } from './api';
import type { ReactNode } from 'react';
vi.mock('../components/ui/kit', async (original) => ({ ...await original<typeof import('../components/ui/kit')>(),
  Sheet: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}{footer}</div> }));
let client: QueryClient;
const input = { word: 'a word', sentence: 'Here is a word.', contentId: 'c', publicationId: 'p', variantKey: 'en', segmentIndex: 2, language: 'en' as const };
const pick = { ...input, id: 'pick/1', seq: 1, status: 'pending', createdAt: '2026-10-19' };
const mount = (node: ReactNode) => render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
describe('mots gardés', () => {
  it('valide longueur, huit mots et inclusion normalisée', () => {
    expect(validWordPick(' A  WORD ', input.sentence)).toBe(true);
    expect(validWordPick('unknown', input.sentence)).toBe(false);
    expect(validWordPick('', input.sentence)).toBe(false);
    expect(validWordPick('one two three four five six seven eight nine', 'one two three four five six seven eight nine')).toBe(false);
  });
  it('envoie le contexte complet et accepte un déjà gardé (200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ pick })));
    await expect(saveWordPick(input)).resolves.toEqual({ pick, alreadySaved: true });
    expect(fetch).toHaveBeenCalledWith('/api/vocabulary/picks', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }));
  });
  it('permet la correction du mot puis confirme sans nouvel envoi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ pick })));
    mount(<WordPickSheet {...input} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'word' } });
    fireEvent.click(screen.getByRole('button', { name: 'Garder ce mot' }));
    await screen.findByText(/Déjà gardé/);
    expect(screen.queryByRole('button', { name: 'Garder ce mot' })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('charge la page suivante et supprime avec la route encodée', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ picks: [pick], nextAfter: 1 }))
      .mockResolvedValueOnce(Response.json({ picks: [{ ...pick, id: 'two', word: 'second', status: 'sent' }], nextAfter: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValue(Response.json({ picks: [], nextAfter: null }));
    vi.stubGlobal('fetch', fetcher);
    mount(<WordPicksList />);
    await screen.findByText('En attente');
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));
    await screen.findByText('Envoyé à EnglishFluency');
    expect(fetcher.mock.calls[1]![0]).toContain('after=1');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer a word' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/vocabulary/picks/pick%2F1', expect.objectContaining({ method: 'DELETE' })));
  });
  it('affiche un état vide', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ picks: [], nextAfter: null })));
    mount(<WordPicksList />);
    await screen.findByText('Aucun mot gardé pour le moment.');
  });
});
