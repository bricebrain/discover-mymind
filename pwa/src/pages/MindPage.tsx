import { useMediaQuery } from '@/lib/useMediaQuery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, Link2, Loader2, PenLine, Plus, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Drawer } from 'vaul';
import { api } from '../api/client';
import { formatWhen } from '../api/episodes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NoteEditor } from '../mind/NoteEditor';
import { publisherMark } from '../explorer/feed';
import { Aurora } from '../vivid/Aurora';
import { dirtyDrafts, newDraft, putDraft, syncDirtyDrafts, type NoteLink, type NoteOrigin, type NoteSummary } from '../mind/store';

/** Aperçu lisible d'un texte Markdown : sans symboles de mise en forme. */
const plain = (md: string) => md.replace(/^#{1,3}\s+/gm, '').replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

/** Crée un brouillon (lié à un épisode, ou article) et ouvre l'éditeur. Utilisé par « Réfléchir » et le volet « Nouvelle note ». */
export function useNewNote() {
  const navigate = useNavigate();
  return async (links: NoteLink[] = [], origin: NoteOrigin = 'personal') => {
    const d = newDraft(links, origin);
    await putDraft(d);
    navigate(`/mind?n=${d.id}`);
  };
}

type Filter = 'all' | 'personal' | 'article' | 'question';
const FILTERS: [Filter, string][] = [['all', 'Tout'], ['personal', 'Réflexions'], ['article', 'Articles'], ['question', 'Questions']];
const filterQuery = (f: Filter) => (f === 'personal' ? 'origin=personal' : f === 'article' ? 'origin=article' : f === 'question' ? 'kind=question' : '');
const QUESTION_STATES = { to_explore: 'à explorer', thinking: 'en réflexion', deepened: 'approfondie' } as const;

/** Sans titre : la première ligne de la note sert de titre, la suite d'aperçu. */
function cardText(note: NoteSummary): { title: string; text: string } {
  if (note.title) return { title: note.title, text: plain(note.excerpt) };
  const lines = note.excerpt.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = plain(lines[0] ?? '');
  return { title: first.slice(0, 90) || 'Note sans titre', text: plain(lines.slice(1).join(' ')) };
}

/** Couleur d'une note selon sa nature : réflexion (sarcelle), article (couleur du journal), question (indigo). */
function toneOf(note: NoteSummary) {
  if (note.origin === 'article') return note.sourceName ? publisherMark(note.sourceName).bg : 'var(--article)';
  if (note.kind === 'question') return '#6366f1';
  return 'var(--primary)';
}

function tagOf(note: NoteSummary) {
  if (note.origin === 'article') return { label: `Article${note.sourceName ? ` · ${note.sourceName}` : ''}`, cls: 'bg-article-soft text-article' };
  if (note.kind === 'question') return { label: `Question${note.questionState ? ` · ${QUESTION_STATES[note.questionState]}` : ''}`, cls: 'bg-indigo-50 text-indigo-800' };
  return { label: 'Réflexion', cls: 'bg-primary-soft text-primary' };
}

function NoteCard({ note, selected, onOpen, index, knownTitle }: { note: NoteSummary; selected: boolean; onOpen: () => void; index: number; knownTitle?: string }) {
  const card = cardText(note);
  // Résultat de recherche : l'extrait commence au mot trouvé ; le titre vient de la note elle-même.
  const title = note.highlights?.length && !note.title && knownTitle ? knownTitle : card.title;
  const text = card.text;
  const tag = tagOf(note);
  const tone = toneOf(note);
  return <motion.button type="button" onClick={onOpen} aria-current={selected ? 'true' : undefined}
    initial={{ opacity: 0, y: 18, scale: 0.98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: '0px 0px -6% 0px' }}
    transition={{ type: 'spring', stiffness: 190, damping: 24, delay: Math.min(index, 6) * 0.04 }} whileTap={{ scale: 0.98 }}
    className={cn('relative flex w-full flex-col gap-1.5 overflow-hidden rounded-[22px] border p-3.5 pl-5 text-left shadow-surface transition-colors',
      selected ? 'border-primary/40 bg-primary-soft' : 'border-border/60')}
    style={selected ? undefined : { background: `linear-gradient(120deg, color-mix(in oklab, ${tone} 11%, var(--card)) 0%, var(--card) 65%)` }}>
    {/* Liseré de couleur à gauche : la nature de la note se lit d'un coup d'œil. */}
    <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: tone }} />
    <span className="flex items-center gap-1.5 text-xs">
      <span className={cn('max-w-[70%] truncate rounded-full px-2 py-0.5 font-semibold', tag.cls)}>{tag.label}</span>
      <span className="text-muted-foreground">{note.localOnly ? 'Sur cet appareil' : formatWhen(note.updatedAt)}</span>
    </span>
    <span className="text-base font-semibold leading-snug">{title}</span>
    {note.highlights?.length
      ? <span className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
        {note.highlights.map((h, i) => (h.highlighted ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-foreground">{h.text}</mark> : <span key={i}>{h.text}</span>))}
      </span>
      : text && text !== title && <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{text}</span>}
    {note.firstLinkTitle && <span className="truncate text-xs text-muted-foreground">↳ {note.firstLinkTitle}</span>}
  </motion.button>;
}

/** En-tête de journal : notes de la semaine, questions à explorer et la dernière d'entre elles, sur une aurore. */
function JournalHeader({ notes, onOpen }: { notes: NoteSummary[]; onOpen: (id: string) => void }) {
  const week = Date.now() - 7 * 86_400_000;
  const thisWeek = notes.filter((n) => Date.parse(n.updatedAt) >= week).length;
  const questions = notes.filter((n) => n.kind === 'question' && n.questionState !== 'deepened');
  const latest = questions[0];
  return <motion.section aria-label="Mon journal" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: 'spring', stiffness: 170, damping: 22 }}
    className="relative mb-3 overflow-hidden rounded-[28px] bg-[#0f2e3a] p-4 text-white shadow-[0_20px_40px_-22px_rgb(0_0_0/0.6)]">
    <Aurora intensity={0.75} />
    <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/35" />
    <p className="relative m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">Mon journal</p>
    <div className="relative mt-1 flex items-end gap-6">
      <p className="m-0"><span className="block font-display text-[2.6rem] leading-none">{thisWeek}</span><span className="text-[13px] text-white/80">note{thisWeek > 1 ? 's' : ''} cette semaine</span></p>
      <p className="m-0"><span className="block font-display text-[2.6rem] leading-none">{questions.length}</span><span className="text-[13px] text-white/80">question{questions.length > 1 ? 's' : ''} ouverte{questions.length > 1 ? 's' : ''}</span></p>
    </div>
    {latest && <button type="button" onClick={() => onOpen(latest.id)}
      className="relative mt-3 flex w-full items-center gap-2 rounded-2xl bg-white/15 px-3 py-2.5 text-left text-[14px] backdrop-blur-md active:scale-[.99]">
      <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-white/70">À explorer</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{cardText(latest).title}</span>
    </button>}
  </motion.section>;
}

/** Volet « Nouvelle note » de la maquette : réflexion, article collé, ou article depuis un lien. */
function NewNoteSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (origin: NoteOrigin) => void }) {
  const actions = [
    { icon: PenLine, title: 'Ma réflexion', hint: 'Écrire librement, en Markdown simple', cls: 'bg-primary-soft text-primary', origin: 'personal' as const },
    { icon: ClipboardPaste, title: 'Coller un article', hint: 'Cookies et « Lire aussi » retirés automatiquement', cls: 'bg-article-soft text-article', origin: 'article' as const },
    { icon: Link2, title: 'Depuis un lien', hint: 'Colle le lien : l’Atelier récupère le texte', cls: 'bg-muted text-foreground', origin: 'article' as const },
  ];
  return <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-[1300] bg-black/45" />
      <Drawer.Content aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-[1300] mx-auto flex max-w-[640px] flex-col gap-3 rounded-t-[28px] bg-card px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-2.5 font-sans text-foreground outline-none">
        <span className="mx-auto h-[5px] w-10 rounded-full bg-zinc-300" aria-hidden />
        <Drawer.Title className="mt-1 font-display text-[1.8rem] leading-none">Nouvelle note</Drawer.Title>
        {actions.map((a) => {
          const Icon = a.icon;
          return <button key={a.title} type="button" onClick={() => onCreate(a.origin)}
            className="flex min-h-16 items-center gap-3.5 rounded-2xl border border-border/70 bg-background p-3.5 text-left active:scale-[.98]">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', a.cls)}><Icon className="size-5" /></span>
            <span className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold">{a.title}</span><span className="text-[13px] text-muted-foreground">{a.hint}</span></span>
          </button>;
        })}
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>;
}

/**
 * My Mind (refonte, étape 5) : recherche dans tout le texte (serveur), filtres, cartes animées, volet « Nouvelle note ».
 * Les brouillons créés hors ligne restent visibles et partent au retour du réseau ; corbeille annulable.
 */
export function MindPage() {
  const wide = useMediaQuery('(min-width:600px)');
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('n');
  const newNote = useNewNote();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheet, setSheet] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState<NoteSummary[]>([]);
  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(t); }, [query]);
  const searching = search.length >= 2;

  const notes = useQuery({
    queryKey: ['reflections', searching ? search : '', filter],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const q = [searching ? `q=${encodeURIComponent(search)}` : '', filterQuery(filter)].filter(Boolean).join('&');
      return (await api<{ reflections: NoteSummary[] }>(`/api/reflections${searching ? '/search' : ''}${q ? `?${q}` : ''}`)).reflections;
    },
  });

  // Brouillons jamais envoyés (créés hors ligne) : visibles dans la liste ; envoi au démarrage et au retour du réseau.
  useEffect(() => {
    const refresh = async () => {
      const drafts = await dirtyDrafts();
      setLocalOnly(drafts.filter((d) => d.baseUpdatedAt === null && (d.title || d.body)).map((d) => ({
        id: d.id, title: d.title || null, excerpt: d.body.slice(0, 280), updatedAt: new Date(d.localUpdatedAt).toISOString(),
        firstLinkTitle: d.links[0]?.targetTitle ?? null, linkCount: d.links.length, localOnly: true, origin: d.origin, sourceName: d.sourceName || null,
      })));
    };
    const sync = async () => {
      if ((await syncDirtyDrafts(selected)) > 0) void qc.invalidateQueries({ queryKey: ['reflections'] });
      await refresh();
    };
    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [qc, notes.dataUpdatedAt, selected]);

  // Liste complète (déjà chargée sans recherche) : sert à retrouver le titre d'une note dans les résultats.
  const fullList = qc.getQueryData<NoteSummary[]>(['reflections', '', 'all']);
  const titles = useMemo(() => new Map((fullList ?? []).map((n) => [n.id, cardText(n).title])), [fullList]);

  const all = useMemo(() => {
    const server = notes.data ?? [];
    // Un brouillon local n'est pas dans l'index du serveur : montré seulement sans recherche, selon le filtre.
    const local = searching ? [] : localOnly.filter((l) => !server.some((s) => s.id === l.id)
      && (filter === 'all' || (filter === 'article' ? l.origin === 'article' : filter === 'personal' ? l.origin !== 'article' : false)));
    return [...local, ...server];
  }, [notes.data, localOnly, searching, filter]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('n', id); else next.delete('n');
    setParams(next, { replace: wide });
  };
  const onDeleted = (id: string, onServer: boolean) => {
    open(null);
    setLocalOnly((l) => l.filter((n) => n.id !== id));
    if (onServer) setUndo(id);
  };
  const restore = async () => {
    if (!undo) return;
    await api(`/api/reflections/${undo}/restore`, { method: 'POST' }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ['reflections'] });
    open(undo);
    setUndo(null);
  };
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 6000); return () => clearTimeout(t); }, [undo]);
  const create = (origin: NoteOrigin) => { setSheet(false); void newNote([], origin); };

  const list = <div className="mx-auto max-w-[760px] px-3 pb-28 pt-3">
    <h1 className="sr-only">My Mind</h1>
    <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 focus-within:border-primary/50">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input type="text" inputMode="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher dans mes notes et articles"
        aria-label="Chercher dans mes notes" maxLength={200} className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-muted-foreground" />
      {notes.isFetching && searching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {query && <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="grid size-8 place-items-center rounded-full text-muted-foreground"><X className="size-4" /></button>}
    </label>
    {!searching && filter === 'all' && (notes.data?.length ?? 0) > 0 && <div className="mt-3"><JournalHeader notes={notes.data!} onOpen={open} /></div>}
    <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FILTERS.map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
        className={cn('h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors active:scale-95',
          filter === id ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground')}>{label}</button>)}
    </div>
    {notes.isPending && <div className="grid place-items-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
    {notes.isError && <p className="mt-3 rounded-xl bg-article-soft p-3 text-sm text-article">{notes.error.message}</p>}
    {notes.isSuccess && !all.length && <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <p className="max-w-xs font-reading text-[1.05rem] text-muted-foreground">
        {searching ? 'Aucune note ne contient ces mots.' : filter !== 'all' ? 'Aucune note dans ce filtre.'
          : 'Une idée, une question, un article : écris-le ici. Il est enregistré sur ton téléphone avant même d’être synchronisé.'}
      </p>
      {!searching && filter === 'all' && <Button onClick={() => setSheet(true)}><Plus className="size-4" />Nouvelle note</Button>}
    </div>}
    <div className="mt-2 flex flex-col gap-2">
      {all.map((n, i) => <NoteCard key={n.id} note={n} index={i} knownTitle={titles.get(n.id)} selected={n.id === selected} onOpen={() => open(n.id)} />)}
    </div>
  </div>;

  // Bouton « + » : dégradé lumineux, apparition en ressort, la croix pivote quand le volet est ouvert.
  const fab = <motion.button type="button" onClick={() => setSheet(true)} aria-label="Nouvelle note" whileTap={{ scale: 0.9 }}
    initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: sheet ? 45 : 0 }} transition={{ type: 'spring', stiffness: 320, damping: 20 }}
    className="fixed right-5 z-[1050] grid size-[60px] place-items-center rounded-[20px] bg-grad-primary text-white shadow-[0_16px_34px_-10px_var(--primary)]"
    style={{ bottom: 'calc(64px + 20px + var(--player-h, 0px) + env(safe-area-inset-bottom) + 18px)' }}>
    <Plus className="size-7" strokeWidth={2.4} />
  </motion.button>;

  const toast = undo && <div role="status" className="fixed inset-x-3 z-[1200] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-dock px-4 py-3 text-sm text-dock-foreground shadow-lg"
    style={{ bottom: 'calc(64px + 24px + var(--player-h, 0px) + env(safe-area-inset-bottom) + 14px)' }}>
    <span className="flex-1">Note mise à la corbeille</span>
    <button type="button" onClick={() => void restore()} className="font-semibold text-primary-soft underline-offset-2 hover:underline">Annuler</button>
  </div>;

  const sheetEl = <NewNoteSheet open={sheet} onClose={() => setSheet(false)} onCreate={create} />;

  if (!wide) {
    return <>
      {selected ? <NoteEditor key={selected} id={selected} onBack={() => (window.history.length > 1 ? window.history.back() : open(null))} onDeleted={onDeleted} /> : <>{list}{fab}</>}
      {toast}{sheetEl}
    </>;
  }
  return <>
    <div className="grid grid-cols-[minmax(300px,4fr)_6fr]"
      style={{ height: 'calc(100dvh - 52px - 64px - var(--player-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}>
      <div className="overflow-y-auto border-r border-border/70">{list}</div>
      <div className="overflow-y-auto">
        {selected ? <NoteEditor key={selected} id={selected} onDeleted={onDeleted} /> : <div className="grid h-full place-items-center px-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <p className="font-display text-3xl">Choisis une note, ou commence-en une</p>
            <Button onClick={() => setSheet(true)}><Plus className="size-4" />Nouvelle note</Button>
          </div>
        </div>}
      </div>
    </div>
    {fab}{toast}{sheetEl}
  </>;
}
