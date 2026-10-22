// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ListeningReviews } from './ListeningReviews';

let state = { isPending: false, isError: false, error: new Error('Indisponible'), refetch: vi.fn(), data: { reviews: [] as { contentId: string; title: string; variantKey: string; step: number }[] } };
vi.mock('../api/listeningReviews', () => ({ useListeningReviews: () => state }));
afterEach(cleanup);

it('présente une réécoute et ouvre directement la bonne version à l’étape 4', () => {
  state = { ...state, data: { reviews: [{ contentId: 'rates', title: 'Les taux', variantKey: 'en-source', step: 2 }] } };
  render(<MemoryRouter><ListeningReviews /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Les taux' }).getAttribute('href')).toBe('/library/rates?v=en-source&review=1&step=4');
});
it('gère les états vide, chargement et erreur', () => {
  state = { ...state, data: { reviews: [] }, isPending: false, isError: false };
  const view = render(<ListeningReviews />);
  expect(screen.getByText('Aucune réécoute prévue aujourd’hui.')).toBeDefined();
  state = { ...state, isPending: true };
  view.rerender(<ListeningReviews />);
  expect(screen.getByLabelText('Chargement des réécoutes')).toBeDefined();
  state = { ...state, isPending: false, isError: true };
  view.rerender(<ListeningReviews />);
  expect(screen.getByText('Indisponible')).toBeDefined();
  expect(screen.getByText('Réessayer')).toBeDefined();
});
