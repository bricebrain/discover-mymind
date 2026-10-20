import { ChevronRight, FolderOpen, NotebookPen, Play, Podcast } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Notice, Spinner, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { usePreparedContents, type LibraryFilters } from '../api/contents';
import { SelectableCard } from '../selection/SelectableCard';
import { DeleteContentButton } from '../content/DeleteContentButton';
import { contentLink } from './ListenStrip';

const SOURCES = {
  youtube: { label: 'YouTube', Icon: Play, cls: 'bg-youtube-soft text-youtube' },
  reflection: { label: 'Note My Mind', Icon: NotebookPen, cls: 'bg-primary-soft text-primary' },
  podcast: { label: 'Podcast', Icon: Podcast, cls: 'bg-muted text-foreground' },
  dossier: { label: 'Dossier', Icon: FolderOpen, cls: 'bg-indigo-50 text-indigo-800' },
} as const;
/** Teinte de la carte selon le type, quand il n'y a pas de pochette. */
const TINT = { youtube: 'var(--youtube)', reflection: 'var(--primary)', podcast: 'var(--primary)', dossier: '#6366f1' } as const;

export function PreparedContents({ filters = {} }: { filters?: LibraryFilters }) {
  const query = usePreparedContents(filters);
  const location = useLocation();
  const total = query.data?.pages[0]?.total ?? 0;
  return <section className="pt-4">
    <div className="mb-2 flex items-baseline gap-2">
      <h2 className="m-0 flex-1 font-display text-[1.6rem] font-normal leading-tight">Préparés dans l’Atelier</h2>
      {query.isSuccess && <span className="text-[13px] text-muted-foreground">{total} contenu{total === 1 ? '' : 's'}</span>}
    </div>
    {query.isPending && <Spinner />}
    {query.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>}
    {query.isSuccess && !total && <p className="text-sm leading-relaxed text-muted-foreground">
      {filters.search ? 'Aucun contenu ne correspond à ce titre.' : 'Les contenus publiés depuis l’Atelier apparaîtront ici. Les demandes en cours sont dans « À préparer ».'}
    </p>}
    <div className="flex flex-col gap-2">
      {query.data?.pages.flatMap((p) => p.contents).map((c, i) => {
        const s = SOURCES[c.sourceType];
        return <SelectableCard key={c.id} item={{ type: 'content', id: c.id, title: c.title }}><motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
          className={cn(cardCls, 'relative flex items-center overflow-hidden')}
          style={c.imageUrl ? undefined : { background: `linear-gradient(120deg, color-mix(in oklab, ${TINT[c.sourceType]} 12%, var(--card)) 0%, var(--card) 72%)` }}>
          {/* Teinte : la pochette très floutée en fond. */}
          {c.imageUrl && <img src={c.imageUrl} alt="" aria-hidden loading="lazy"
            className="pointer-events-none absolute inset-0 size-full scale-150 object-cover opacity-[.14] blur-2xl saturate-150 dark:opacity-[.22]" />}
          <Link state={{ libraryLocation: location.pathname + location.search }} to={contentLink(c)}
            className="relative flex min-w-0 flex-1 items-center gap-3 p-3 text-foreground no-underline active:opacity-70">
            {c.imageUrl
              ? <img src={c.imageUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl object-cover shadow-[0_6px_14px_-8px_rgb(0_0_0/0.5)]" />
              : <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', s.cls)}><s.Icon className="size-5" /></span>}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{c.title}</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">
                {s.label} · {c.originalLanguage.toUpperCase()} · {c.variantCount} version{c.variantCount > 1 ? 's' : ''}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
          <div className="relative pr-1"><DeleteContentButton id={c.id} title={c.title} compact /></div>
        </motion.div></SelectableCard>;
      })}
    </div>
    {query.hasNextPage && <Button variant="outline" className="mt-3 w-full" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Voir la suite</Button>}
  </section>;
}
