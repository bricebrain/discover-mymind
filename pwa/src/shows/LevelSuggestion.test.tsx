import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '../api/shows';
import type { LevelSuggestion as Suggestion } from '../levels/types';
import { LevelSuggestion } from './LevelSuggestion';
import { useShowLevelSuggestion } from './useShowLevelSuggestion';

vi.mock('./useShowLevelSuggestion', () => ({ useShowLevelSuggestion: vi.fn() }));
const show = { id: 'podcast', autoLevel: 'B1' } as Show;
const state = () => ({
  query: { isPending: false, isError: false, isFetching: false, error: null as Error | null, refetch: vi.fn() },
  update: { isPending: false, isError: false, error: null as Error | null },
  suggestion: { showId: 'podcast', currentLevel: 'B1', suggestedLevel: 'B2', changed: true,
    reason: 'two_too_easy', message: 'Deux retours « trop facile » consécutifs.' } as Suggestion | null,
  apply: vi.fn(), dismiss: vi.fn(),
});
let model: ReturnType<typeof state>;
const render = (busy = false) => renderToStaticMarkup(<LevelSuggestion show={show} busy={busy} />);
beforeEach(() => {
  model = state();
  vi.mocked(useShowLevelSuggestion).mockImplementation(() => model as unknown as ReturnType<typeof useShowLevelSuggestion>);
});

describe('présentation de la suggestion dans les abonnements', () => {
  it('présente le niveau, la raison et les deux choix sans appliquer au rendu', () => {
    const html = render();
    expect(html).toContain('Essayer B2 ?');
    expect(html).toContain('Deux retours « trop facile » consécutifs.');
    expect(html).toContain('Appliquer');
    expect(html).toContain('Ignorer');
    expect(model.apply).not.toHaveBeenCalled();
    expect(model.dismiss).not.toHaveBeenCalled();
  });

  it('n’affiche rien sans proposition', () => {
    model.suggestion = null;
    expect(render()).toBe('');
  });

  it('montre le chargement et une erreur de lecture récupérable', () => {
    model.query.isPending = true;
    expect(render()).toContain('Chargement du niveau suggéré');
    model.query.isPending = false;
    model.query.isError = true;
    model.query.error = new Error('Connexion impossible.');
    const html = render();
    expect(html).toContain('Niveau suggéré indisponible.');
    expect(html).toContain('Connexion impossible.');
    expect(html).toContain('Réessayer');
    expect(html).not.toContain('Appliquer');
  });

  it('bloque les choix pendant une écriture ou un rafraîchissement', () => {
    expect(render(true).match(/disabled=""/g)).toHaveLength(2);
    model.update.isPending = true;
    expect(render().match(/disabled=""/g)).toHaveLength(2);
    model.update.isPending = false;
    model.query.isFetching = true;
    expect(render().match(/disabled=""/g)).toHaveLength(2);
  });

  it('garde la proposition et présente l’échec du PATCH pour permettre un nouvel essai', () => {
    model.update.isError = true;
    model.update.error = new Error('Hors ligne.');
    const html = render();
    expect(html).toContain('Hors ligne.');
    expect(html).toContain('Appliquer');
  });
});
