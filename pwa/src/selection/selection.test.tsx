// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { SelectionProvider, useSelection } from './useSelection';
import { SelectableCard } from './SelectableCard';
import { SelectionBar } from './SelectionBar';
import { canCreateDossier, toggleSelection, type SelectionRef } from './model';
const a: SelectionRef = { type: 'article', id: 'one', title: 'Article' };
const b: SelectionRef = { type: 'episode', id: 'one', title: 'Podcast' };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function Controls() {
  const { items } = useSelection();
  return <><output>{items.map((x) => x.title).join(',')}</output>
    <SelectableCard item={a}><a href="/?a=one">Ouvrir</a></SelectableCard>
    <SelectableCard item={b}><span>Podcast</span></SelectableCard><SelectionBar onCreate={() => {}} /></>;
}
describe('sélection de sources', () => {
  it('préserve les types et borne à six sans mutation', () => {
    const first = toggleSelection([], a);
    const second = toggleSelection(first, b);
    expect(first).toEqual([a]); expect(second).toEqual([a, b]);
    expect(canCreateDossier(first)).toBe(false); expect(canCreateDossier(second)).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => ({ ...a, id: `${i}` }));
    expect(toggleSelection(six, b)).toBe(six);
    expect(toggleSelection(second, a)).toEqual([b]);
  });
  it('active par contrôle accessible, intercepte les liens et annule', () => {
    render(<SelectionProvider><Controls /></SelectionProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Article' }));
    expect(screen.getByText('1 sélectionnés · 2 à 6 sources')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Créer un dossier' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Podcast' }));
    expect((screen.getByRole('button', { name: 'Créer un dossier' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });
  it('sort sur retour Android sans perdre la page courante', () => {
    render(<SelectionProvider><Controls /></SelectionProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Article' }));
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });
  it('active après 500 ms, vibre et absorbe le clic qui suit', () => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', MouseEvent);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    render(<SelectionProvider><Controls /></SelectionProvider>);
    const link = screen.getByText('Ouvrir');
    fireEvent.pointerDown(link, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(link); fireEvent.click(link);
    expect(screen.getByText('1 sélectionnés · 2 à 6 sources')).toBeDefined();
    expect(vibrate).toHaveBeenCalledWith(20);
    expect(screen.getByRole('button', { name: 'Sélectionner Article' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('ne démarre pas une sélection pendant un défilement', () => {
    vi.useFakeTimers(); vi.stubGlobal('PointerEvent', MouseEvent);
    render(<SelectionProvider><Controls /></SelectionProvider>);
    const link = screen.getByText('Ouvrir');
    fireEvent.pointerDown(link, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(link, { clientX: 10, clientY: 40 });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('complementary')).toBeNull();
  });
  it('annule l’appui long au déplacement et au démontage', () => {
    vi.useFakeTimers();
    const view = render(<SelectionProvider><Controls /></SelectionProvider>);
    fireEvent.pointerDown(screen.getByText('Ouvrir'), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(screen.getByText('Ouvrir'));
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('complementary')).toBeNull();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
