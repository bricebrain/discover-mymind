import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmSheet, Notice, Spinner, Switch, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { ApiError } from '../api/client';
import { CATEGORY_LABELS, formatWhen, type Category } from '../api/episodes';
import { useDeleteShow, useShows, useUpdateShow, type Show } from '../api/shows';
import { categoryColor } from '../app/theme';
import { AddShowDialog } from '../shows/AddShowDialog';
import { AutoPrepareCard, AutoPrepareChip } from '../shows/AutoPrepare';
import { LevelSuggestion } from '../shows/LevelSuggestion';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Une erreur est survenue.');

function status(show: Show): string {
  if (!show.enabled) return 'En pause';
  if (show.lastError) return `Erreur : ${show.lastError}`;
  if (!show.lastSuccessAt) return 'Première vérification dans quelques minutes';
  return `${show.episodeCount} vidéo${show.episodeCount > 1 ? 's' : ''} · vérifiée ${formatWhen(show.lastSuccessAt)}`;
}

function ShowRow({ show, busy, onToggle, onDelete }: { show: Show; busy: boolean; onToggle: (v: boolean) => void; onDelete: () => void }) {
  return <div className={cn('flex flex-col gap-2 p-3 transition-opacity', !show.enabled && 'opacity-60')}>
    <div className="flex items-center gap-3">
      {show.imageUrl
        ? <img src={show.imageUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl bg-muted object-cover" />
        : <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted font-display text-xl">{show.title.slice(0, 1)}</span>}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{show.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          YouTube · {show.language.toUpperCase()}{show.titleFilter ? ` · filtre : ${show.titleFilter.join(', ')}` : ''}
        </span>
        <span className={cn('mt-0.5 flex items-center gap-1 text-xs', show.lastError ? 'text-amber-700' : 'text-muted-foreground')}>
          {show.lastError && <AlertTriangle className="size-3.5 shrink-0" />}<span className="truncate">{status(show)}</span>
        </span>
      </span>
      <Switch checked={show.enabled} disabled={busy} onChange={onToggle} label={`Suivre ${show.title}`} />
      <Button variant="ghost" size="icon-sm" className="-mr-1 text-muted-foreground" aria-label={`Ne plus suivre ${show.title}`} onClick={onDelete}>
        <Trash2 className="size-[18px]" />
      </Button>
    </div>
    <div className="pl-[60px]">
      <AutoPrepareChip show={show} />
      <LevelSuggestion show={show} busy={busy} />
    </div>
  </div>;
}

export function ShowsPage() {
  const shows = useShows();
  const update = useUpdateShow();
  const remove = useDeleteShow();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Show | null>(null);
  const count = shows.data?.shows.filter((s) => s.enabled).length ?? 0;
  const max = shows.data?.max ?? 50;

  return <div className="mx-auto max-w-[760px] px-4 pb-8 pt-3">
    <h1 className="sr-only">Mes chaînes YouTube</h1>
    <div className="mb-4 flex items-center gap-3">
      <p className="m-0 flex-1 text-[13px] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">{count} / {max}</span> chaînes YouTube actives. Vérification à tour de rôle, environ toutes les 30 à 60 minutes.
      </p>
      <Button onClick={() => setAdding(true)} disabled={count >= max}><Plus className="size-4" />Ajouter</Button>
    </div>

    {shows.data && <AutoPrepareCard enabled={shows.data.autoPrepareEnabled} shows={shows.data.shows} />}
    {shows.isPending && <div className="grid place-items-center p-8"><Spinner /></div>}
    {(update.isError || remove.isError) && <Notice tone="warning" className="mb-3">{errorText(update.error ?? remove.error)}</Notice>}
    {shows.isError && <Notice tone="warning">{errorText(shows.error)}</Notice>}

    {CATEGORIES.map((cat, gi) => {
      const group = shows.data?.shows.filter((s) => s.category === cat) ?? [];
      if (group.length === 0) return null;
      return <motion.section key={cat} className="mb-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}>
        <h2 className="mb-2 mt-0 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.08em] text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: categoryColor(cat, 'light') }} />{CATEGORY_LABELS[cat]}
          <span className="font-normal normal-case tracking-normal">· {group.length}</span>
        </h2>
        <div className={cn(cardCls, 'divide-y divide-border/70 overflow-hidden')}>
          {group.map((s) => <ShowRow key={s.id} show={s} busy={update.isPending}
            onToggle={(enabled) => update.mutate({ id: s.id, enabled })} onDelete={() => setToDelete(s)} />)}
        </div>
      </motion.section>;
    })}

    {adding && <AddShowDialog onClose={() => setAdding(false)} />}
    {toDelete && <ConfirmSheet title={`Ne plus suivre ${toDelete.title} ?`} confirm="Ne plus suivre" busy={remove.isPending}
      onClose={() => setToDelete(null)} onConfirm={() => remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">Ses contenus non sauvegardés disparaîtront d’Explorer. Les contenus sauvegardés ou préparés sont conservés.</p>
    </ConfirmSheet>}
  </div>;
}
