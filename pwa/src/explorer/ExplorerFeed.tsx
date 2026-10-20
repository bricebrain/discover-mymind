import { Loader2 } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMediaQuery, WIDE } from '@/lib/useMediaQuery';
import { useArticles } from '../api/articles';
import { useExplorer, type ExplorerFilters } from '../api/episodes';
import { ArticleDetail } from '../articles/ArticleDetail';
import { EventGroupCard } from '../related/EventGroupCard';
import { HeroCarousel } from './HeroCarousel';
import { useExplorerEvents } from '../related/useExplorerEvents';
import { DossierPrepareDialog } from '../dossiers/DossierPrepareDialog';
import { Notice } from '../components/ui/kit';
import { Button } from '@/components/ui/button';
import { dayLabel } from './dayLabel';
import { EpisodeDetail } from '../components/EpisodeDetail';
import { usePlayer } from '../player/PlayerProvider';
import { ArticleFeedCard, EpisodeFeedCard, ResumeFeedCard } from './FeedCards';
import { mergeFeed } from './feed';

/**
 * Fil unique d'Explorer : podcasts, vidéos et articles dans la même liste verticale, par jour. Déplié (Fold7) : le détail à
 * côté ; plié : en plein écran. L'élément ouvert est dans l'URL (?e= épisode, ?a= article).
 */
export function ExplorerFeed({ filters, withEpisodes, withArticles, showResume, header, empty }: {
  filters: ExplorerFilters; withEpisodes: boolean; withArticles: boolean; showResume: boolean; header: ReactNode; empty: string;
}) {
  const events = useExplorerEvents();
  const wide = useMediaQuery(WIDE);
  const [params, setParams] = useSearchParams();
  const player = usePlayer();
  const episodesQuery = useExplorer(filters, withEpisodes);
  const articlesQuery = useArticles({ lang: filters.lang }, withArticles);
  const episodes = withEpisodes ? episodesQuery.data?.pages.flatMap((p) => p.episodes) ?? [] : [];
  const articles = withArticles ? articlesQuery.data?.pages.flatMap((p) => p.articles) ?? [] : [];
  const { items, hasMore } = mergeFeed(episodes, articles, {
    episodes: withEpisodes && !!episodesQuery.hasNextPage, articles: withArticles && !!articlesQuery.hasNextPage,
  });
  const selectedEpisode = params.get('e'), selectedArticle = params.get('a');
  const pending = (withEpisodes && episodesQuery.isPending) || (withArticles && articlesQuery.isPending);
  const error = (withEpisodes && episodesQuery.error) || (withArticles && articlesQuery.error) || null;
  const loadingMore = episodesQuery.isFetchingNextPage || articlesQuery.isFetchingNextPage;
  const resume = showResume ? episodes.find((e) => e.progressMs && e.progressDurationMs && e.progressCompleted !== 1 && e.progressMs > 5000
    && !(player.track?.targetType === 'episode' && player.track.targetId === e.id)) : undefined;

  const open = (kind: 'e' | 'a', id: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('e'); next.delete('a'); next.delete('v');
    if (id) next.set(kind, id);
    setParams(next, { replace: wide });
    // Plié : le détail remplace le fil, on le lit depuis le haut.
    if (!wide && id) window.scrollTo({ top: 0 });
  };
  const close = () => (window.history.length > 1 ? window.history.back() : open('e', null));
  const loadMore = () => {
    if (withEpisodes && episodesQuery.hasNextPage) void episodesQuery.fetchNextPage();
    if (withArticles && articlesQuery.hasNextPage) void articlesQuery.fetchNextPage();
  };

  let lastDay = '';
  const list = <div className="mx-auto max-w-[760px] px-3 pb-8 pt-3">
    <div className="px-1">{header}</div>
    {showResume && !pending && <HeroCarousel items={items.slice(0, 6)} onOpen={(it) => open(it.kind === 'episode' ? 'e' : 'a', it.kind === 'episode' ? it.episode.id : it.article.id)} />}
    {resume && <div className="mb-2 mt-1"><ResumeFeedCard episode={resume} /></div>}
    {pending && <div className="grid place-items-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
    {error && <p className="m-2 rounded-xl bg-article-soft p-3 text-sm text-article">{error.message}</p>}
    {!pending && !error && !items.length && <p className="px-4 py-16 text-center font-reading text-[1.05rem] text-muted-foreground">{empty}</p>}
    {events.query.isError && <Notice tone="warning">Les événements liés n’ont pas pu être chargés.</Notice>}
    {events.create.isError && <Notice tone="error">{events.create.error.message}</Notice>}
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const day = dayLabel(item.date || null);
        const showDay = day !== lastDay;
        lastDay = day;
        return <Fragment key={item.key}>
          {showDay && <h2 className="px-1 pb-0.5 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day}</h2>}
          {showDay && events.byDay.has(day) && <div className={events.create.isPending ? 'pointer-events-none opacity-60' : ''}>
            <EventGroupCard group={events.byDay.get(day)!} onCreateDossier={events.prepare} onDismiss={() => events.dismiss(events.byDay.get(day)!.groupId)} />
          </div>}
          {item.kind === 'episode'
            ? <EpisodeFeedCard episode={item.episode} index={index} selected={item.episode.id === selectedEpisode} onOpen={() => open('e', item.episode.id)} shared={!wide} />
            : <ArticleFeedCard article={item.article} index={index} selected={item.article.id === selectedArticle} onOpen={() => open('a', item.article.id)} shared={!wide} />}
        </Fragment>;
      })}
    </div>
    {hasMore && !pending && <div className="mt-4 text-center">
      <Button variant="outline" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Chargement…' : 'Voir plus'}</Button>
    </div>}
  </div>;

  const detail = selectedEpisode ? <EpisodeDetail id={selectedEpisode} onBack={wide ? undefined : close} />
    : selectedArticle ? <ArticleDetail id={selectedArticle} onBack={wide ? undefined : close} /> : null;
  const preparing = events.dossier && <DossierPrepareDialog dossier={events.dossier} onClose={events.close} />;
  if (!wide) return <>{detail ?? list}{preparing}</>;
  return <div className="grid grid-cols-[minmax(320px,5fr)_6fr]"
    style={{ height: 'calc(100dvh - 52px - 64px - var(--player-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}>
    <div className="overflow-y-auto border-r border-border/70">{list}</div>
    <div className="overflow-y-auto">
      {detail ?? <div className="grid h-full place-items-center px-8 text-center text-muted-foreground">
        <div><p className="mb-1 font-display text-3xl text-foreground">Choisis un contenu</p>
          <p className="mx-auto max-w-xs">Épisode, vidéo ou article : il s’affichera ici, pendant que le fil reste à portée.</p></div>
      </div>}
    </div>
    {preparing}
  </div>;
}
