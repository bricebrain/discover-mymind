import type { ArticleSummary } from '../api/articles';
import type { Episode } from '../api/episodes';

export type FeedItem = { kind: 'episode'; key: string; date: string; episode: Episode } | { kind: 'article'; key: string; date: string; article: ArticleSummary };

/**
 * Fil unique d'Explorer : épisodes (podcasts, vidéos) et articles mêlés, du plus récent au plus ancien.
 * Deux listes paginées : tant qu'une liste peut encore fournir des éléments plus anciens, le fil s'arrête au plus récent des
 * deux « derniers chargés » — sinon un élément pas encore chargé apparaîtrait plus tard au milieu du fil.
 */
export function mergeFeed(episodes: Episode[], articles: ArticleSummary[], more: { episodes: boolean; articles: boolean }) {
  const items: FeedItem[] = [
    ...episodes.map((e) => ({ kind: 'episode' as const, key: `e:${e.id}`, date: e.publishedAt ?? '', episode: e })),
    ...articles.map((a) => ({ kind: 'article' as const, key: `a:${a.id}`, date: a.publishedAt ?? '', article: a })),
  ].sort((x, y) => (x.date === y.date ? x.key.localeCompare(y.key) : y.date.localeCompare(x.date)));
  const limits = [
    more.episodes && episodes.length ? episodes[episodes.length - 1]!.publishedAt ?? '' : null,
    more.articles && articles.length ? articles[articles.length - 1]!.publishedAt ?? '' : null,
  ].filter((d): d is string => d !== null);
  const cutoff = limits.length ? limits.reduce((a, b) => (a > b ? a : b)) : null;
  return { items: cutoff === null ? items : items.filter((i) => i.date >= cutoff), hasMore: more.episodes || more.articles };
}

/** Vignette d'un journal : abréviation typographique sur sa couleur (pas de logo déposé). */
const PUBLISHERS: Record<string, { mark: string; bg: string; fg: string }> = {
  'The Guardian': { mark: 'G', bg: '#052962', fg: '#ffffff' },
  'The Conversation': { mark: 'TC', bg: '#d8352a', fg: '#ffffff' },
  ProPublica: { mark: 'PP', bg: '#111111', fg: '#ffffff' },
  'BBC': { mark: 'BBC', bg: '#1a1a1a', fg: '#ffffff' },
};
export function publisherMark(publisher: string) {
  const known = PUBLISHERS[publisher];
  if (known) return known;
  const words = publisher.replace(/^(the|le|la|les)\s+/i, '').split(/\s+/).filter(Boolean);
  return { mark: (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [publisher.slice(0, 2)]).join('').toUpperCase(), bg: '#3f3f46', fg: '#ffffff' };
}
