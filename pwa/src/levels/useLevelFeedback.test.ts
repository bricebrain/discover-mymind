import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, type MutationObserverOptions, type QueryKey } from '@tanstack/react-query';
import { useLevelSuggestion, useUpdateShow } from '../api/shows';
import { ApiError } from '../api/client';
import { levelFeedbackKey, levelSuggestionKey } from './keys';
import type { LevelFeedbackResponse } from './types';
import { useLevelFeedback } from './useLevelFeedback';

let client: QueryClient;
// Adapter les hooks au moteur React Query réel, sans ajouter de DOM ou de dépendance de test.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => client,
    useQuery: (options: { queryKey: QueryKey; initialData?: unknown }) => {
      if (client.getQueryData(options.queryKey) === undefined && options.initialData !== undefined) {
        client.setQueryData(options.queryKey, options.initialData);
      }
      return { data: client.getQueryData(options.queryKey), options };
    },
    useMutation: (options: MutationObserverOptions<unknown, Error, unknown>) => {
      const observer = new actual.MutationObserver(client, options);
      return { ...observer.getCurrentResult(), mutateAsync: (input: unknown) => observer.mutate(input) };
    },
  };
});

const feedback = { contentId: 'episode/1', variantKey: 'en b1', showId: 'podcast', publicationId: 'pub-1',
  level: 'B1' as const, rating: 'too_easy' as const };
const levelSuggestion = { showId: 'podcast', currentLevel: 'B1' as const, suggestedLevel: 'B2' as const,
  changed: true, reason: 'two_too_easy' as const, message: 'Essayer le niveau supérieur.' };
const reply = (value: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('useLevelFeedback', () => {
  it('ne charge ni ne soumet de retour au montage', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(useLevelFeedback('episode/1', 'en b1').feedback).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('envoie le contrat exact, garde le retour et invalide émission et suggestion', async () => {
    reply({ feedback, levelSuggestion } satisfies LevelFeedbackResponse);
    client.setQueryData(['shows'], { shows: [] });
    client.setQueryData(levelSuggestionKey('podcast'), { levelSuggestion: null });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = useLevelFeedback('episode/1', 'en b1');
    await hook.mutateAsync({ publicationId: 'pub-1', rating: 'too_easy' });
    expect(fetch).toHaveBeenCalledWith('/api/contents/episode%2F1/variants/en%20b1/feedback', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', body: JSON.stringify({ publicationId: 'pub-1', rating: 'too_easy' }),
      headers: expect.objectContaining({ 'X-Discover-Client': '1', 'Content-Type': 'application/json' }),
    }));
    expect(useLevelFeedback('episode/1', 'en b1').feedback).toEqual(feedback);
    expect(client.getQueryData(levelSuggestionKey('podcast'))).toEqual({ levelSuggestion });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['shows'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: levelSuggestionKey('podcast') });
  });

  it.each(['just_right', 'too_hard', null] as const)('corrige ou annule avec %s', async (rating) => {
    client.setQueryData(levelFeedbackKey('episode/1', 'en b1'), feedback);
    const next = rating === null ? null : { ...feedback, rating };
    reply({ feedback: next, levelSuggestion });
    await useLevelFeedback('episode/1', 'en b1').mutateAsync({ publicationId: 'pub-1', rating });
    expect(useLevelFeedback('episode/1', 'en b1').feedback).toEqual(next);
    expect(useLevelFeedback('autre', 'en b1').feedback).toBeNull();
    expect(useLevelFeedback('episode/1', 'en b2').feedback).toBeNull();
  });

  it('conserve le retour précédent en cas d’erreur et expose l’échec', async () => {
    client.setQueryData(levelFeedbackKey('episode/1', 'en b1'), feedback);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {
      code: 'unsupported_level', message: 'Version non anglaise.',
    } }, { status: 422 })));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await expect(useLevelFeedback('episode/1', 'en b1').mutateAsync({ publicationId: 'pub-1', rating: null }))
      .rejects.toMatchObject({ status: 422, code: 'unsupported_level' });
    expect(client.getQueryData(levelFeedbackKey('episode/1', 'en b1'))).toEqual(feedback);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('expose une erreur réseau sans effacer l’avis connu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(useLevelFeedback('id', 'key').mutateAsync({ publicationId: 'pub', rating: 'too_easy' }))
      .rejects.toBeInstanceOf(ApiError);
  });
});

describe('raccordement des suggestions aux abonnements', () => {
  it('lit la route dédiée avec une clé partagée', async () => {
    reply({ levelSuggestion });
    const query = useLevelSuggestion('show/1') as unknown as {
      options: { queryKey: QueryKey; queryFn: () => Promise<unknown> };
    };
    expect(query.options.queryKey).toEqual(levelSuggestionKey('show/1'));
    expect(await query.options.queryFn()).toEqual({ levelSuggestion });
    expect(fetch).toHaveBeenCalledWith('/api/shows/show%2F1/level-suggestion', expect.anything());
  });

  it('applique uniquement autoLevel avec le PATCH existant et rafraîchit la suggestion', async () => {
    reply({ show: { id: 'podcast', autoLevel: 'B2' } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await useUpdateShow().mutateAsync({ id: 'podcast', autoLevel: 'B2' });
    expect(fetch).toHaveBeenCalledWith('/api/shows/podcast', expect.objectContaining({ method: 'PATCH', body: '{"autoLevel":"B2"}' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: levelSuggestionKey('podcast') });
  });
});
