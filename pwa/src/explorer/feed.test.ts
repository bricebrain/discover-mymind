import { describe, expect, it } from 'vitest';
import type { ArticleSummary } from '../api/articles';
import type { Episode } from '../api/episodes';
import { mergeFeed, publisherMark } from './feed';

const ep = (id: string, publishedAt: string) => ({ id, publishedAt } as Episode);
const ar = (id: string, publishedAt: string) => ({ id, publishedAt } as ArticleSummary);

describe('fil unique d’Explorer', () => {
  it('mêle épisodes et articles du plus récent au plus ancien', () => {
    const { items, hasMore } = mergeFeed([ep('e1', '2026-10-19T08:00:00Z'), ep('e2', '2026-10-18T08:00:00Z')], [ar('a1', '2026-10-18T20:00:00Z')], { episodes: false, articles: false });
    expect(items.map((i) => i.key)).toEqual(['e:e1', 'a:a1', 'e:e2']);
    expect(hasMore).toBe(false);
  });
  it('s’arrête au plus récent des derniers chargés tant qu’une liste a une suite', () => {
    const eps = [ep('e1', '2026-10-19T08:00:00Z'), ep('e2', '2026-10-15T08:00:00Z')];
    const arts = [ar('a1', '2026-10-18T20:00:00Z'), ar('a2', '2026-10-17T10:00:00Z')];
    // Les articles ont une suite : rien de plus ancien que a2 tant qu'elle n'est pas chargée.
    const { items, hasMore } = mergeFeed(eps, arts, { episodes: false, articles: true });
    expect(items.map((i) => i.key)).toEqual(['e:e1', 'a:a1', 'a:a2']);
    expect(hasMore).toBe(true);
  });
  it('vignette d’un journal connu ou inconnu', () => {
    expect(publisherMark('The Guardian')).toMatchObject({ mark: 'G' });
    expect(publisherMark('The Conversation').mark).toBe('TC');
    expect(publisherMark('Financial Times').mark).toBe('FT');
    expect(publisherMark('Axios').mark).toBe('AX');
  });
});
