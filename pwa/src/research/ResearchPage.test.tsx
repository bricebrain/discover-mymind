// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ResearchPage } from '../pages/ResearchPage';

const status = { enabled: true, autoPublish: false, configured: true, topics: { ai: 'Intelligence artificielle', science: 'Recherche scientifique' },
  weeklyDrafts: 3, reservedMicros: 250_000, limitMicros: 10_000_000, reservePerRunMicros: 250_000, runs: [] };
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });
function mount(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ResearchPage /></MemoryRouter></QueryClientProvider>);
}

it('présente la veille et un état vide explicite', async () => {
  mount(vi.fn<typeof fetch>(async url => Response.json(String(url).endsWith('status') ? status : { drafts: [] })));
  expect(await screen.findByText('Recherches Discover')).toBeTruthy();
  expect(await screen.findByText(/Aucun brouillon pour l’instant/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lancer la veille du jour' })).toBeTruthy();
});

it('affiche une erreur de chargement avec possibilité de réessayer', async () => {
  mount(vi.fn<typeof fetch>(async () => Response.json({ error: { code: 'down', message: 'Serveur indisponible' } }, { status: 503 })));
  expect(await screen.findByText('Serveur indisponible')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
});

it('affiche la publication automatique sans demander de validation humaine', async () => {
  mount(vi.fn<typeof fetch>(async url => Response.json(String(url).endsWith('status') ? { ...status, autoPublish: true } : { drafts: [] })));
  expect(await screen.findByText(/Les articles sont publiés automatiquement après un contrôle documentaire favorable/)).toBeTruthy();
  const checkbox = screen.getByRole('checkbox', { name: 'Publier automatiquement après le contrôle documentaire' }) as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  expect(screen.queryByText(/Chaque article reste un brouillon jusqu’à ta validation/)).toBeNull();
});

it('bloque la publication d’un brouillon dont le contrôle comporte des réserves', async () => {
  const draft = { id: 'a'.repeat(20), title: 'Une découverte à vérifier', topic: 'science', state: 'draft', createdAt: '2026-10-27',
    review: { verdict: 'review', reasons: ['Résultat préliminaire à confirmer.'] } };
  mount(vi.fn<typeof fetch>(async url => {
    if (String(url).endsWith('status')) return Response.json(status);
    if (String(url).endsWith('drafts')) return Response.json({ drafts: [draft] });
    return Response.json({ draft: { ...draft, article: { title: draft.title, summary: 'Un résultat préliminaire.', topicKey: 'test',
      sections: [{ heading: 'Limites', text: 'Les résultats restent préliminaires.', sourceIds: ['s1'] }],
      sources: [{ id: 's1', title: 'Étude', url: 'https://cnrs.fr/etude' }] } } });
  }));
  fireEvent.click(await screen.findByRole('button', { name: 'Lire le brouillon et ses sources' }));
  const button = await screen.findByRole('button', { name: 'Valider et publier' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Résultat préliminaire à confirmer.')).toBeTruthy();
});
