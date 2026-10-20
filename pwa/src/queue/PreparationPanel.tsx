import { Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Notice, Spinner, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { Episode } from '../api/episodes';
import { defaultOptions, optionsLabel, queueLabel } from './options';
import { PrepareDialog } from './PrepareDialog';
import type { QueueItem } from './types';
import { usePreparation } from './usePreparation';
import { AtelierHint, ExecutorChip, PreparationProgress } from './PreparationProgress';

const KINDS = { episode: 'Podcast', youtube: 'YouTube', reflection: 'My Mind', dossier: 'Dossier' } as const;
const DOT: Record<QueueItem['status'], string> = {
  pending: 'bg-amber-500', leased: 'bg-primary animate-pulse', done: 'bg-emerald-600', failed: 'bg-red-600', cancelled: 'bg-zinc-400',
};

function Action({ to, href, onClick, disabled, children, muted }: { to?: string; href?: string; onClick?: () => void; disabled?: boolean; children: ReactNode; muted?: boolean }) {
  const cls = cn('h-9 px-3 text-[13px]', muted ? 'text-muted-foreground' : 'text-primary');
  if (to) return <Button asChild variant="ghost" size="sm" className={cls}><Link to={to} className="no-underline">{children}</Link></Button>;
  if (href) return <Button asChild variant="ghost" size="sm" className={cls}><a href={href} target="_blank" rel="noreferrer" className="no-underline">{children}</a></Button>;
  return <Button variant="ghost" size="sm" className={cls} disabled={disabled} onClick={onClick}>{children}</Button>;
}

export function PreparationPanel({episode}: {episode?: Episode}) {
  const target = episode ? (episode.videoId ? {kind:'youtube' as const,id:episode.videoId} : {kind:'episode' as const,id:episode.id}) : undefined;
  const {query,cancel,retry,remove} = usePreparation(target);
  const [open,setOpen] = useState(false);
  const items = query.data?.items ?? [];
  const active = items.some((i) => i.status==='pending' || i.status==='leased');
  const current = items.find((i) => i.status==='pending' || i.status==='leased') ?? items[0];
  // Dans le détail d'un épisode, une préparation terminée se voit déjà dans ses versions : seules les actives ou en échec s'affichent.
  const shown = episode ? (current && current.status!=='done' && current.status!=='cancelled' ? [current] : [])
    : items.filter((i) => i.status!=='cancelled').slice(0,20);
  return <section className="my-4">
    {!episode && <h2 className="mb-2 mt-1 font-display text-[1.6rem] font-normal leading-tight">File de préparation</h2>}
    {query.isPending && <Spinner label="Chargement des préparations" />}
    {query.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>}
    {episode && <Button variant="outline" disabled={active || query.isPending || query.isError} onClick={() => setOpen(true)}>
      <Sparkles className="size-4 text-primary" />{episode.contentId ? 'Préparer une autre version' : 'Préparer en anglais'}
    </Button>}
    {!episode && query.isSuccess && !shown.length && <p className="text-sm leading-relaxed text-muted-foreground">Ajoute un lien YouTube, ou choisis « Préparer en anglais » sur un épisode ou une note My Mind.</p>}
    <div className="mt-2 flex flex-col gap-2">{shown.map((item) => <div key={item.id} className={cn(cardCls, 'p-3')}>
      {!episode && <div className="mb-1 flex items-center gap-2">
        <ExecutorChip executor={item.executor} /><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{KINDS[item.kind]}</span>
      </div>}
      {!episode && <p className="m-0 line-clamp-2 text-[15px] font-semibold leading-snug">{item.title}</p>}
      <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-sm"><span className={cn('size-2 shrink-0 rounded-full', DOT[item.status])} />{queueLabel(item)}
        {episode && <ExecutorChip executor={item.executor} />}</p>
      {/* En préparation : frise des étapes, pourcentage et temps restant (barre lumineuse si l'avancement manque). */}
      {item.status === 'leased' && (item.progress ? <PreparationProgress item={item} fetchedAt={query.dataUpdatedAt} />
        : <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="progress-slide block h-full w-1/3 rounded-full bg-grad-primary" />
        </span>)}
      {item.status === 'pending' && item.executor !== 'cloud' && <AtelierHint seenAt={query.data?.atelierSeenAt ?? null} waiting={item.waiting} />}
      <p className="m-0 mt-0.5 text-xs text-muted-foreground">{optionsLabel(item.options)}</p>
      {item.error && item.status==='failed' && <p className="m-0 mt-1 text-sm text-red-700">{item.error}</p>}
      <div className="-mx-2 mt-1 flex flex-wrap">
        {!episode && item.kind==='episode' && <Action to={`/?e=${item.ref}`}>Voir l’épisode</Action>}
        {!episode && item.kind==='reflection' && <Action to={`/mind?n=${item.ref}`}>Voir la note</Action>}
        {!episode && item.kind==='youtube' && <Action href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.ref)}`}>Voir la vidéo</Action>}
        {['pending','leased'].includes(item.status) && <Action disabled={cancel.isPending} onClick={() => cancel.mutate(item.id)}>Annuler</Action>}
        {item.status==='failed' && item.executor!=='cloud' && <Action disabled={retry.isPending || items.some((i) => i.ref===item.ref && (i.status==='pending' || i.status==='leased'))} onClick={() => retry.mutate(item.id)}>Réessayer</Action>}
        {item.status==='done' && item.contentId && <Action to={item.kind==='episode' ? `/?e=${item.ref}` : `/library/${item.contentId}`}>Écouter les versions</Action>}
        {!episode && ['done','failed','cancelled'].includes(item.status) && <Action muted disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Retirer de la liste</Action>}
      </div>
    </div>)}</div>
    {(cancel.isError || retry.isError || remove.isError) && <Notice tone="error" className="mt-2">{cancel.error?.message ?? retry.error?.message ?? remove.error?.message}</Notice>}
    {open && episode && target && <PrepareDialog key={episode.id} target={target} title={episode.title}
      initial={defaultOptions(episode.durationSec,episode.showId)} faithfulAllowed={episode.language==='fr'} onClose={() => setOpen(false)} />}
  </section>;
}
