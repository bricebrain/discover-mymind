// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EarProgressView } from './EarProgress';
afterEach(cleanup);

it('montre la part des phrases comprises, la tendance et les erreurs fréquentes', () => {
  render(<EarProgressView data={{ understoodThreshold: 0.9, recent: [],
    weeks: [{ week: '2026-10-12', sentences: 10, understood: 4, understoodShare: 0.4, wordAccuracy: 0.8 },
      { week: '2026-10-19', sentences: 8, understood: 5, understoodShare: 0.625, wordAccuracy: 0.86 }],
    categories: [{ category: 'reduced_form', count: 6 }, { category: 'number', count: 2 }] }} />);
  expect(screen.getByText('63 %')).toBeDefined();
  expect(screen.getByText(/\+23 points/)).toBeDefined();
  expect(screen.getByText('Forme réduite')).toBeDefined();
  expect(screen.getByRole('img', { name: 'Phrases comprises à l’oreille par semaine' })).toBeDefined();
});

it('invite à faire une dictée tant qu’il n’y a rien à mesurer', () => {
  render(<EarProgressView data={{ understoodThreshold: 0.9, weeks: [], categories: [], recent: [] }} />);
  expect(screen.getByText(/Fais une dictée/)).toBeDefined();
});
