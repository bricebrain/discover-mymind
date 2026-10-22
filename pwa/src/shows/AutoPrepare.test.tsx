// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '../api/shows';
import { AutoPrepareCard, AutoPrepareChip } from './AutoPrepare';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../api/shows', () => ({
  useAutoPrepareSetting: () => ({ mutate, isPending: false, isError: false }),
  useUpdateShow: () => ({ mutate, isPending: false, isError: false }),
}));
vi.mock('@/components/ui/kit', async (original) => ({
  ...await original<typeof import('@/components/ui/kit')>(),
  Sheet: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}{footer}</div>,
}));
const show = {
  id: 'chaine', title: 'Une chaîne', enabled: true, autoPrepare: true,
  autoPreset: 'condensed8', autoLevel: 'original',
} as Show;

beforeEach(() => mutate.mockClear());
afterEach(cleanup);

describe('préparation automatique en Original guidé', () => {
  it('annonce la formule réelle et la voix locale gratuite', () => {
    render(<AutoPrepareCard enabled shows={[show]} />);
    expect(screen.getByText(/La formule est Original guidé/).textContent).toContain('gratuite et locale');
    expect(screen.queryByText(/Deepgram/)).toBeNull();
  });

  it('convertit le niveau historique en C1 et enregistre sans changer le preset de l’API', () => {
    render(<AutoPrepareChip show={show} />);
    fireEvent.click(screen.getByRole('button', { name: /Auto · Original guidé · explications C1/ }));
    const level = screen.getByRole('combobox', { name: 'Niveau des explications' }) as HTMLSelectElement;
    expect(level.value).toBe('C1');
    expect(Array.from(level.options, (o) => o.value)).toEqual(['A2', 'B1', 'B2', 'C1']);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/non simplifié/)).toBeNull();
    fireEvent.change(level, { target: { value: 'B2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(mutate).toHaveBeenCalledWith(
      { id: 'chaine', autoPrepare: true, autoLevel: 'B2' },
      { onSuccess: expect.any(Function) },
    );
  });
});
