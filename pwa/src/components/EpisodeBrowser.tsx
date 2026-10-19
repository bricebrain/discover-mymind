import { Loader2 } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/kit';
import { useMediaQuery, WIDE } from '@/lib/useMediaQuery';
import { useExplorer, type ExplorerFilters } from '../api/episodes';
import { dayLabel } from '../explorer/dayLabel';
import { EpisodeFeedCard } from '../explorer/FeedCards';
import { EpisodeDetail } from './EpisodeDetail';

/**
 * Liste d'épisodes groupés par jour + détail (Bibliothèque › Sauvegardés). Plié : la liste, puis le détail en plein écran.
 * Déplié : côte à côte. L'épisode ouvert est dans l'URL (?e=…).
 */
export function EpisodeBrowser({ filters, header, empty }: { filters: ExplorerFilters; header: ReactNode; empty: ReactNode }) {
  const wide = useMediaQuery(WIDE);
  const [params, setParams] = useSearchParams();
  const selected = params.get('e');
  const explorer = useExplorer(filters);
  const episodes = explorer.data?.pages.flatMap((p) => p.episodes) ?? [];

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('e', id); else next.delete('e');
    next.delete('v'); // la version choisie appartient à l'épisode précédent
    setParams(next, { replace: wide });
    if (!wide && id) window.scrollTo({ top: 0 });
  };

  let lastDay = '';
  const list = <div className="mx-auto max-w-[760px] pb-6">
    {header}
    {explorer.isPending && <div className="grid place-items-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
    {explorer.isError && <Notice tone="warning">{explorer.error.message}</Notice>}
    {explorer.isSuccess && episodes.length === 0 && <p className="px-4 py-12 text-center font-reading text-[1.05rem] text-muted-foreground">{empty}</p>}
    <div className="flex flex-col gap-2">
      {episodes.map((e, i) => {
        const day = dayLabel(e.publishedAt);
        const showDay = day !== lastDay;
        lastDay = day;
        return <Fragment key={e.id}>
          {showDay && <h3 className="m-0 px-1 pb-0.5 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day}</h3>}
          <EpisodeFeedCard episode={e} index={i} selected={e.id === selected} onOpen={() => open(e.id)} />
        </Fragment>;
      })}
    </div>
    {explorer.hasNextPage && <div className="mt-4 text-center">
      <Button variant="outline" onClick={() => void explorer.fetchNextPage()} disabled={explorer.isFetchingNextPage}>
        {explorer.isFetchingNextPage ? 'Chargement…' : 'Plus de contenus'}
      </Button>
    </div>}
  </div>;

  if (!wide) return selected ? <EpisodeDetail id={selected} onBack={() => window.history.length > 1 ? window.history.back() : open(null)} /> : list;
  return <div className="grid grid-cols-[minmax(320px,5fr)_6fr] gap-4">
    <div>{list}</div>
    <div className="sticky top-[60px] self-start">
      {selected ? <EpisodeDetail id={selected} /> : <div className="grid min-h-[40vh] place-items-center px-8 text-center text-muted-foreground">
        <div><p className="mb-1 font-display text-3xl text-foreground">Choisis un contenu</p>
          <p className="mx-auto max-w-xs">Son détail et sa transcription s’afficheront ici.</p></div>
      </div>}
    </div>
  </div>;
}
