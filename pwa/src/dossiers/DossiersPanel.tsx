import { ChevronDown, FolderPlus, Pencil, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Notice, Spinner, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useDossier, useDossiers, type Dossier } from '../api/dossiers';
import { DossierEditor } from './DossierEditor';
import { DossierPrepareDialog } from './DossierPrepareDialog';

export const SOURCE_TYPES = { episode: 'Épisode', content: 'Contenu préparé', reflection: 'Note', article: 'Article' } as const;
const STATUS = { pending: 'En file · ouvrir l’Atelier sur le Mac', leased: 'En préparation dans l’Atelier', done: 'Prêt', failed: 'Échec', cancelled: 'Annulé' } as const;
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function Runs({ id }: { id: string }) {
  const query = useDossier(id);
  if (query.isPending) return <Spinner className="size-4" />;
  if (query.isError) return <Notice tone="warning">{query.error.message}</Notice>;
  if (!query.data.runs.length) return <p className="m-0 text-sm text-muted-foreground">Pas encore préparé.</p>;
  return <ul className="m-0 flex list-none flex-col gap-1 p-0">
    {query.data.runs.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="flex-1">{dateFmt.format(new Date(r.createdAt))} · version {r.version} · {r.status ? STATUS[r.status] : 'Demande retirée'}</span>
      {r.status === 'done' && r.contentId && <Button asChild variant="ghost" size="sm" className="text-primary"><Link to={`/library/${r.contentId}`} className="no-underline">Écouter</Link></Button>}
    </li>)}
  </ul>;
}

function DossierCard({ dossier, onEdit, onPrepare }: { dossier: Dossier; onEdit: () => void; onPrepare: () => void }) {
  const [open, setOpen] = useState(false);
  const missing = dossier.sources.filter((s) => !s.title).length;
  return <article className={cn(cardCls, 'p-4')}>
    <h3 className="m-0 text-[16px] font-semibold leading-snug">{dossier.title}</h3>
    <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">{dossier.sources.length} sources · modifié le {dateFmt.format(new Date(dossier.updatedAt))}</p>
    <ol className="my-3 flex list-none flex-col gap-1.5 p-0">
      {dossier.sources.map((s, i) => <li key={`${s.type}:${s.id}`} className="flex items-start gap-2.5 text-sm">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-800">{i + 1}</span>
        <span className={cn('min-w-0 flex-1 leading-snug', !s.title && 'text-amber-700')}>
          {s.title ?? 'Source indisponible'} <span className="text-xs text-muted-foreground">· {SOURCE_TYPES[s.type]}</span>
        </span>
      </li>)}
    </ol>
    {missing > 0 && <Notice tone="warning" className="mb-3">Une source a été supprimée : retire-la avant de préparer.</Notice>}
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" onClick={onPrepare} disabled={missing > 0}><Sparkles className="size-4" />Préparer en anglais</Button>
      <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="size-4" />Modifier</Button>
      <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Préparations<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </Button>
    </div>
    <AnimatePresence initial={false}>
      {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
        <div className="mt-3 border-t border-border/70 pt-3"><Runs id={dossier.id} /></div>
      </motion.div>}
    </AnimatePresence>
  </article>;
}

/** Dossiers multisources : plusieurs sources complémentaires, une synthèse commune préparée par l'Atelier. */
export function DossiersPanel() {
  const query = useDossiers();
  const [editing, setEditing] = useState<Dossier | 'new' | null>(null);
  const [preparing, setPreparing] = useState<Dossier | null>(null);
  return <section className="pb-2 pt-1">
    <p className="mb-3 mt-0 text-sm leading-relaxed text-muted-foreground">
      Réunis 2 à 6 épisodes, vidéos, contenus préparés ou notes sur un même sujet : l’Atelier en fait une synthèse en anglais
      qui évite les répétitions, explicite les désaccords et renvoie à chaque source.
    </p>
    <Button variant="outline" className="mb-3" onClick={() => setEditing('new')}><FolderPlus className="size-4 text-primary" />Nouveau dossier</Button>
    {query.isPending && <Spinner />}
    {query.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>}
    {query.isSuccess && !query.data.dossiers.length && <p className="text-sm text-muted-foreground">Aucun dossier pour l’instant.</p>}
    <div className="flex flex-col gap-2.5">
      {query.data?.dossiers.map((d) => <DossierCard key={d.id} dossier={d} onEdit={() => setEditing(d)} onPrepare={() => setPreparing(d)} />)}
    </div>
    {editing && <DossierEditor dossier={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
      onSaved={(saved) => { setEditing(null); if (editing === 'new') setPreparing(saved); }} />}
    {preparing && <DossierPrepareDialog dossier={preparing} onClose={() => setPreparing(null)} />}
  </section>;
}
