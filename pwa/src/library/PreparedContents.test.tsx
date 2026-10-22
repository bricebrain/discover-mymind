// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { PreparedContents } from './PreparedContents';
import { SelectionProvider } from '../selection/useSelection';

vi.mock('../player/PlayerProvider', () => ({ usePlayer: () => ({ track: null }) }));

let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

it('affiche les badges indépendants reçus de la bibliothèque sur chaque carte', async () => {
  const cases = [
    { id: 'both', title: 'Les deux', guided: true, dictated: true },
    { id: 'guided', title: 'Avec guide', guided: true, dictated: false },
    { id: 'dictated', title: 'Avec dictée', guided: false, dictated: true },
    { id: 'neither', title: 'Sans badge', guided: false, dictated: false },
  ];
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ total: cases.length, nextOffset: null,
    contents: cases.map((c) => ({ ...c, sourceType: 'youtube', originalLanguage: 'en', variantCount: 1, updatedAt: '2026-10-22', category: null })),
  }));
  vi.stubGlobal('fetch', fetcher);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><SelectionProvider><PreparedContents /></SelectionProvider></MemoryRouter></QueryClientProvider>);
  await screen.findByText('Les deux');
  for (const c of cases) {
    const card = within(screen.getByRole('link', { name: new RegExp(c.title) }));
    expect(Boolean(card.queryByText('Guidé'))).toBe(c.guided);
    expect(Boolean(card.queryByText('Dicté'))).toBe(c.dictated);
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/library?offset=0');
});
