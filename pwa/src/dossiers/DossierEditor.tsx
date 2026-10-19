import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import { Reorder } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import {
  MAX_SOURCES, MIN_SOURCES, useDossierCandidates, useDossierMutations, type Dossier, type DossierCandidate, type DossierRef,
} from '../api/dossiers';

type Picked = DossierRef & { title: string; label: string };
const key = (r: DossierRef) => `${r.type}:${r.id}`;

/** Création ou modification d'un dossier : un titre et 2 à 6 sources choisies à la main, dans l'ordre voulu. */
export function DossierEditor({ dossier, onClose, onSaved }: { dossier?: Dossier; onClose: () => void; onSaved: (d: Dossier) => void }) {
  const [title, setTitle] = useState(dossier?.title ?? '');
  const [picked, setPicked] = useState<Picked[]>(() => (dossier?.sources ?? []).map((s) => ({ type: s.type, id: s.id, title: s.title ?? 'Source indisponible', label: '' })));
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  const candidates = useDossierCandidates(debounced);
  const { create, update } = useDossierMutations();
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const full = picked.length >= MAX_SOURCES;

  const add = (c: DossierCandidate) => {
    if (full || picked.some((p) => key(p) === key(c))) return;
    setPicked((list) => [...list, { type: c.type, id: c.id, title: c.title, label: c.label }]);
  };
  const move = (index: number, delta: number) => setPicked((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    return next;
  });
  const save = () => {
    const body = { title: title.trim(), sources: picked.map(({ type, id }) => ({ type, id })) };
    const done = ({ dossier: saved }: { dossier: Dossier }) => onSaved(saved);
    if (dossier) update.mutate({ id: dossier.id, version: dossier.version, ...body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  return <Sheet wide title={dossier ? 'Modifier le dossier' : 'Nouveau dossier'} onClose={onClose} locked={saving} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
    <Button onClick={save} disabled={saving || !title.trim() || picked.length < MIN_SOURCES}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
  </>}>
    <Field label="Sujet du dossier">
      <input className={inputCls} value={title} maxLength={200} autoFocus={!dossier} onChange={(e) => setTitle(e.target.value)} />
    </Field>
    <div>
      <p className="m-0 mb-1.5 text-[13px] font-semibold">Sources choisies · {picked.length}/{MAX_SOURCES}</p>
      {!picked.length && <p className="m-0 text-sm text-muted-foreground">Choisis au moins {MIN_SOURCES} sources complémentaires : épisodes, vidéos, contenus préparés ou notes.</p>}
      <Reorder.Group data-vaul-no-drag axis="y" values={picked} onReorder={setPicked} className="m-0 flex list-none flex-col gap-1.5 p-0">
        {picked.map((p, i) => <Reorder.Item key={key(p)} value={p}
          className="flex cursor-grab touch-none items-center gap-2 rounded-xl border border-border bg-background py-1 pl-3 pr-1 active:cursor-grabbing">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-800">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.title}</span>
            {p.label && <span className="block text-xs text-muted-foreground">{p.label}</span>}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Descendre" disabled={i === picked.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${p.title}`} onClick={() => setPicked((l) => l.filter((x) => key(x) !== key(p)))}><X className="size-4" /></Button>
        </Reorder.Item>)}
      </Reorder.Group>
    </div>
    <Field label="Chercher une source" hint={full ? `${MAX_SOURCES} sources au maximum.` : 'Titre d’un épisode, d’une vidéo, d’un contenu préparé ou d’une note.'}>
      <span className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="text" inputMode="search" className={cn(inputCls, 'pl-9')} value={search} maxLength={200} onChange={(e) => setSearch(e.target.value)} />
      </span>
    </Field>
    {candidates.isPending && <Spinner />}
    {candidates.isError && <Notice tone="warning">{candidates.error.message}</Notice>}
    {candidates.data && <ul className="m-0 flex max-h-72 list-none flex-col overflow-y-auto rounded-xl border border-border p-1">
      {candidates.data.sources.map((c) => {
        const chosen = picked.some((p) => key(p) === key(c));
        return <li key={key(c)}>
          <button type="button" disabled={chosen || full} onClick={() => add(c)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-muted disabled:opacity-45">
            <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{c.label}</span>
            {!chosen && <Plus className="size-4 shrink-0 text-primary" />}
          </button>
        </li>;
      })}
      {!candidates.data.sources.length && <li className="px-2.5 py-2 text-sm text-muted-foreground">Aucune source ne correspond.</li>}
    </ul>}
    {error && <Notice tone="error">{error.message}</Notice>}
  </Sheet>;
}
