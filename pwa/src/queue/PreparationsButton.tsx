import { CheckCircle2, ChevronRight, Clock, RotateCcw, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { optionsLabel } from './options';
import { AtelierHint, ExecutorChip, PreparationProgress } from './PreparationProgress';
import type { QueueItem } from './types';
import { usePreparation } from './usePreparation';

const KINDS = { episode: 'Podcast', youtube: 'YouTube', reflection: 'Note', dossier: 'Dossier' } as const;
const RECENT_MS = 48 * 3600_000;

/** Lien vers ce que la demande prépare (épisode, note, contenu publié). */
function targetLink(item: QueueItem): string | null {
  if (item.status === 'done' && item.contentId) return item.kind === 'episode' ? `/?e=${item.ref}` : `/library/${item.contentId}`;
  if (item.kind === 'episode') return `/?e=${item.ref}`;
  if (item.kind === 'reflection') return `/mind?n=${item.ref}`;
  return null;
}

function Row({ item, onClose, children, action }: { item: QueueItem; onClose: () => void; children?: ReactNode; action?: ReactNode }) {
  const link = targetLink(item);
  const head = <span className="min-w-0 flex-1">
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
      <ExecutorChip executor={item.executor} /><span className="rounded-full bg-muted px-2 py-0.5">{KINDS[item.kind]}</span>{optionsLabel(item.options)}
    </span>
    <span className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-snug text-foreground">{item.title}</span>
  </span>;
  return <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
    className={cn(cardCls, 'list-none p-3')}>
    <div className="flex items-start gap-2">
      {link ? <Link to={link} onClick={onClose} className="flex min-w-0 flex-1 items-start gap-2 no-underline">{head}<ChevronRight className="mt-5 size-4 shrink-0 text-muted-foreground" /></Link> : head}
      {action}
    </div>
    {children}
  </motion.li>;
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return <section>
    <h3 className="m-0 mb-2 flex items-baseline gap-2 text-[13px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}<span className="font-normal">· {count}</span></h3>
    <ul className="m-0 flex flex-col gap-2 p-0"><AnimatePresence initial={false}>{children}</AnimatePresence></ul>
  </section>;
}

/** Volet « Préparations » : en cours (avec l'avancement), en attente (avec la place dans la file), terminées récemment. */
export function PreparationsSheet({ onClose }: { onClose: () => void }) {
  const { query, cancel, retry } = usePreparation();
  const items = query.data?.items ?? [];
  const now = Date.now();
  const running = items.filter((i) => i.status === 'leased');
  const waiting = items.filter((i) => i.status === 'pending');
  const recent = items.filter((i) => (i.status === 'done' || i.status === 'failed') && now - Date.parse(i.updatedAt) < RECENT_MS).slice(0, 10);
  const cancelBtn = (i: QueueItem) => <Button variant="ghost" size="icon-sm" className="-mr-1 text-muted-foreground" aria-label={`Annuler ${i.title}`}
    disabled={cancel.isPending} onClick={() => cancel.mutate(i.id)}><X className="size-4" /></Button>;
  return <Sheet wide title="Préparations" onClose={onClose}>
    {query.isSuccess && !running.length && !waiting.length && !recent.length && <p className="m-0 py-6 text-center text-sm text-muted-foreground">
      Aucune préparation en ce moment. Choisis « Préparer en anglais » sur un épisode, une vidéo ou une note.
    </p>}
    <Section title="En cours" count={running.length}>
      {running.map((i) => <Row key={i.id} item={i} onClose={onClose} action={cancelBtn(i)}>
        {i.progress ? <PreparationProgress item={i} fetchedAt={query.dataUpdatedAt} />
          : <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="progress-slide block h-full w-1/3 rounded-full bg-grad-primary" /></span>}
      </Row>)}
    </Section>
    <Section title="En attente" count={waiting.length}>
      {waiting.map((i) => <Row key={i.id} item={i} onClose={onClose} action={cancelBtn(i)}>
        {i.executor === 'cloud' ? <p className="m-0 mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" />En file sans Mac</p>
          : i.stage === 'review' ? <p className="m-0 mt-1.5 text-xs text-amber-700">À relire dans l’Atelier sur le Mac avant publication</p>
          : <AtelierHint seenAt={query.data?.atelierSeenAt ?? null} waiting={i.waiting} />}
      </Row>)}
    </Section>
    <Section title="Terminées récemment" count={recent.length}>
      {recent.map((i) => <Row key={i.id} item={i} onClose={onClose}
        action={i.status === 'failed' && i.executor !== 'cloud' ? <Button variant="ghost" size="icon-sm" aria-label={`Réessayer ${i.title}`} className="-mr-1 text-primary"
          disabled={retry.isPending} onClick={() => retry.mutate(i.id)}><RotateCcw className="size-4" /></Button> : undefined}>
        {i.status === 'done'
          ? <p className="m-0 mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" />Prête · à écouter dans la Bibliothèque</p>
          : <p className="m-0 mt-1.5 text-xs text-red-700">Échec{i.error ? ` : ${i.error}` : ''}</p>}
      </Row>)}
    </Section>
  </Sheet>;
}

/**
 * Bouton de la barre du haut : un anneau qui se remplit avec la préparation en cours, et une pastille avec le nombre de
 * demandes en cours ou en attente. Ouvre le volet « Préparations ».
 */
export function PreparationsButton() {
  const [open, setOpen] = useState(false);
  const { query } = usePreparation();
  const items = query.data?.items ?? [];
  const running = items.find((i) => i.status === 'leased');
  const active = items.filter((i) => i.status === 'leased' || i.status === 'pending').length;
  const pct = running?.progress?.percent ?? (running ? 8 : 0);
  const r = 17, c = 2 * Math.PI * r;
  return <>
    <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => setOpen(true)}
      aria-label={active ? `Préparations : ${active} en cours ou en attente` : 'Préparations'} title="Préparations"
      className="relative grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
      {running && <svg aria-hidden viewBox="0 0 40 40" className="absolute inset-0 size-10 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-primary/20" />
        <motion.circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary"
          strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
      </svg>}
      <Sparkles className={cn('size-[18px]', running ? 'text-primary' : '')} />
      <AnimatePresence>{active > 0 && <motion.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
        className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-article px-1 text-[10px] font-bold text-white ring-2 ring-background">{active}</motion.span>}</AnimatePresence>
    </motion.button>
    {open && <PreparationsSheet onClose={() => setOpen(false)} />}
  </>;
}
