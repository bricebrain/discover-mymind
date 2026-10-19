import { AlertTriangle, ArrowLeft, CloudCheck, CloudOff, Podcast, RefreshCw, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Notice, Sheet, Spinner } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { UnderlineTabs } from '../components/EpisodeDetail';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { cleanPastedArticle, worthCleaning } from './cleanPaste';
import { renderMarkdown } from './markdown';
import { NoteOriginFields } from './NoteOriginFields';
import { NotePreparation } from './NotePreparation';
import { ArticleFetch } from './ArticleFetch';
import { deleteDraft, draftFromNote, getDraft, pushDraft, putDraft, type ArticleFetchStatus, type Draft, type Note } from './store';

type Status = 'loading' | 'saved' | 'saving' | 'local' | 'offline' | 'conflict' | 'error' | 'missing';

const STATUS: Record<Exclude<Status, 'loading' | 'missing'>, { label: string; icon: ReactElement }> = {
  saved: { label: 'Synchronisée', icon: <CloudCheck className="size-4" /> },
  saving: { label: 'Synchronisation…', icon: <RefreshCw className="size-4 animate-spin" /> },
  local: { label: 'Enregistrée sur l’appareil', icon: <CloudCheck className="size-4" /> },
  offline: { label: 'Hors ligne — enregistrée sur l’appareil', icon: <CloudOff className="size-4" /> },
  conflict: { label: 'Modifiée ailleurs', icon: <AlertTriangle className="size-4" /> },
  error: { label: 'Non synchronisée', icon: <AlertTriangle className="size-4" /> },
};

const PUSH_DELAY = 1200;
const isEmpty = (d: Draft) => d.title.trim() === '' && d.body.trim() === '';

/**
 * Éditeur d'une note : chaque frappe est enregistrée sur l'appareil (immédiatement), puis envoyée au
 * Worker (1,2 s). Un seul envoi à la fois ; un conflit (409) est montré, jamais écrasé en silence.
 */
export function NoteEditor({ id, onBack, onDeleted }: { id: string; onBack?: () => void; onDeleted: (id: string, onServer: boolean) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [conflict, setConflict] = useState<Note | null>(null);
  const [englishContentId, setEnglishContentId] = useState<string | null>(null);
  const [articleFetch, setArticleFetch] = useState<ArticleFetchStatus | null>(null);
  /** Dernier collage nettoyé : de quoi revenir au texte brut. */
  const [pasted, setPasted] = useState<{ raw: string; removed: number; joined: number } | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const latest = useRef<Draft | null>(null);
  const timers = useRef<{ push?: number }>({});
  const inflight = useRef(false);
  const again = useRef(false);

  const push = useCallback(async () => {
    const d = latest.current;
    if (!d || !d.dirty || (d.baseUpdatedAt === null && isEmpty(d))) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    setStatus('saving');
    const r = await pushDraft(d);
    inflight.current = false;
    const now = latest.current;
    if (!now || now.id !== d.id) return;
    if (r.status === 'saved') {
      const changedMeanwhile = now.localUpdatedAt !== d.localUpdatedAt;
      const next: Draft = changedMeanwhile ? { ...now, baseUpdatedAt: r.note.updatedAt } : { ...draftFromNote(r.note), localUpdatedAt: now.localUpdatedAt };
      latest.current = next;
      setDraft(next);
      await putDraft(next);
      setStatus(changedMeanwhile ? 'local' : 'saved');
      void qc.invalidateQueries({ queryKey: ['reflections'] });
      if (changedMeanwhile || again.current) {
        again.current = false;
        void push();
      }
    } else if (r.status === 'conflict') {
      setConflict(r.current);
      setStatus('conflict');
    } else {
      setStatus(r.status === 'offline' ? 'offline' : 'error');
    }
  }, [qc]);

  // Chargement : le brouillon local non synchronisé l'emporte, sinon la version du serveur.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setConflict(null);
    setTab('write');
    (async () => {
      const local = await getDraft(id);
      const server = await api<{ reflection: Note }>(`/api/reflections/${id}`).then((r) => r.reflection).catch(() => null);
      if (!alive) return;
      setEnglishContentId(server?.englishContentId ?? null);
      setArticleFetch(server?.articleFetch ?? null);
      let d: Draft | null = null;
      if (local && (local.dirty || !server)) d = local;
      else if (server) {
        d = draftFromNote(server);
        await putDraft(d);
      }
      latest.current = d;
      setDraft(d);
      setStatus(!d ? 'missing' : d.dirty ? 'local' : 'saved');
      if (d?.dirty) void push();
    })();
    return () => {
      alive = false;
    };
  }, [id, push]);

  // En quittant la note ou l'app : on écrit tout de suite sur l'appareil et on tente l'envoi.
  useEffect(() => {
    const flush = () => {
      const d = latest.current;
      if (!d) return;
      window.clearTimeout(timers.current.push);
      if (d.baseUpdatedAt === null && isEmpty(d)) {
        void deleteDraft(d.id);
        return;
      }
      void putDraft(d);
      void push();
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    const onOnline = () => latest.current?.dirty && void push();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', onOnline);
      flush();
    };
  }, [id, push]);

  const edit = (patch: Partial<Pick<Draft, 'title' | 'body' | 'origin' | 'sourceName' | 'sourceUrl'>>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch, dirty: true, localUpdatedAt: Date.now() };
    latest.current = next;
    setDraft(next);
    if (status !== 'conflict') setStatus('local');
    // Écriture immédiate sur l'appareil à chaque frappe : fermer l'app ne perd rien (IndexedDB est rapide).
    void putDraft(next);
    window.clearTimeout(timers.current.push);
    if (status !== 'conflict') timers.current.push = window.setTimeout(() => void push(), PUSH_DELAY);
  };

  const keepMine = () => {
    if (!latest.current || !conflict) return;
    latest.current = { ...latest.current, baseUpdatedAt: conflict.updatedAt, dirty: true };
    setConflict(null);
    void push();
  };
  const takeTheirs = async () => {
    if (!conflict) return;
    const d = draftFromNote(conflict);
    latest.current = d;
    setDraft(d);
    await putDraft(d);
    setConflict(null);
    setStatus('saved');
  };

  /** Texte de l'article récupéré par l'Atelier : appliqué seulement si rien n'a été écrit entre-temps. */
  const applyFetched = async (note: Note) => {
    const d = latest.current;
    if (!d || d.id !== note.id || d.dirty || d.body.trim()) return;
    const next = draftFromNote(note);
    latest.current = next;
    setDraft(next);
    await putDraft(next);
    setStatus('saved');
    void qc.invalidateQueries({ queryKey: ['reflections'] });
  };

  useEffect(() => {
    if (!pasted) return;
    const t = window.setTimeout(() => setPasted(null), 9000);
    return () => window.clearTimeout(t);
  }, [pasted]);

  const remove = async () => {
    const d = latest.current;
    if (!d) return;
    const onServer = d.baseUpdatedAt !== null;
    latest.current = null;
    if (onServer) await api(`/api/reflections/${d.id}`, { method: 'DELETE' }).catch(() => {});
    await deleteDraft(d.id);
    void qc.invalidateQueries({ queryKey: ['reflections'] });
    onDeleted(d.id, onServer);
  };

  if (status === 'loading') return <div className="grid place-items-center p-10"><Spinner /></div>;
  if (status === 'missing' || !draft) return <Notice tone="warning" className="m-4">Note introuvable.</Notice>;
  const st = STATUS[status];
  const pastedMessage = pasted ? `Texte nettoyé : ${[pasted.removed ? `${pasted.removed} ligne${pasted.removed > 1 ? 's' : ''} parasite${pasted.removed > 1 ? 's' : ''} retirée${pasted.removed > 1 ? 's' : ''}` : '', pasted.joined ? `${pasted.joined} phrase${pasted.joined > 1 ? 's' : ''} recollée${pasted.joined > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}.` : '';

  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
    className={cn('mx-auto max-w-[720px] px-4 pb-12', onBack ? 'pt-2' : 'pt-5')}>
    <div className="mb-2 flex items-center gap-2">
      {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour aux notes" className="-ml-2"><ArrowLeft className="size-5" /></Button>}
      <span role="status" className={cn('flex flex-1 items-center gap-1.5 text-xs font-semibold',
        status === 'conflict' || status === 'error' ? 'text-amber-700' : 'text-muted-foreground')}>{st.icon}{st.label}</span>
      <Button variant="ghost" size="icon" title="Mettre à la corbeille" aria-label="Mettre la note à la corbeille" className="text-muted-foreground"
        onClick={() => void remove()}><Trash2 className="size-5" /></Button>
    </div>

    {draft.links.length > 0 && <div className="mb-3 flex flex-col gap-1.5">
      {draft.links.map((l) => <Link key={`${l.targetType}:${l.targetId}`} to={l.targetType === 'episode' ? `/?e=${l.targetId}` : '/library'}
        className="flex min-h-10 items-center gap-2 rounded-xl bg-muted px-3 text-muted-foreground no-underline">
        <Podcast className="size-4 shrink-0 text-primary" /><span className="truncate text-sm font-semibold">{l.targetTitle ?? 'Épisode'}</span>
      </Link>)}
    </div>}

    <input value={draft.title} onChange={(e) => edit({ title: e.target.value })} placeholder="Titre (facultatif)" aria-label="Titre de la note" maxLength={200}
      className="mb-2 w-full appearance-none border-0 bg-transparent p-0 font-display text-[1.9rem] leading-tight text-foreground outline-none placeholder:text-zinc-400" />

    <NoteOriginFields draft={draft} onChange={edit}>
      <ArticleFetch key={draft.id} draft={draft} synced={status === 'saved'} initial={articleFetch} onFilled={applyFetched} />
    </NoteOriginFields>

    <UnderlineTabs id={`note-${draft.id}`} value={tab} onChange={setTab} options={[['write', 'Écrire'], ['preview', 'Aperçu']] as const} />

    {tab === 'write' ? <textarea
      value={draft.body}
      onChange={(e) => edit({ body: e.target.value })}
      onPaste={(e) => {
        // Article collé depuis un site : cookies, « Lire aussi », crédits… retirés ; annulable.
        const raw = e.clipboardData.getData('text/plain');
        const cleaned = cleanPastedArticle(raw);
        if (!worthCleaning(raw, cleaned)) return;
        e.preventDefault();
        const area = e.target as HTMLTextAreaElement;
        const start = area.selectionStart ?? draft.body.length, end = area.selectionEnd ?? start;
        const head = draft.body.slice(0, start), tail = draft.body.slice(end);
        edit({ body: head + cleaned.text + tail });
        setPasted({ raw: head + raw + tail, removed: cleaned.removedLines, joined: cleaned.joinedLines });
      }}
      placeholder={'Écris librement ou colle un article… (Markdown simple : # titre, - liste, **gras**)'}
      aria-label="Texte de la note" maxLength={100_000}
      autoFocus={draft.baseUpdatedAt === null && isEmpty(draft)}
      className="min-h-[18rem] w-full resize-none appearance-none border-0 bg-transparent p-0 font-reading text-[1.08rem] leading-[1.75] text-foreground outline-none [field-sizing:content] placeholder:text-zinc-400"
    /> : <div
      className="font-reading text-[1.08rem] leading-[1.75] [&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[.9em] [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-[1.6rem] [&_h2]:font-normal [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-display [&_h3]:text-[1.35rem] [&_h3]:font-normal [&_h4]:font-semibold [&_ol]:pl-6 [&_p]:my-3 [&_ul]:pl-6"
      // Rendu sûr : tout le HTML est échappé par renderMarkdown (§ 8.6).
      dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) || '<p style="opacity:.6">Rien à afficher.</p>' }}
    />}

    <NotePreparation id={draft.id} title={draft.title} body={draft.body} synced={status === 'saved'} englishContentId={englishContentId} />

    <AnimatePresence>
      {pasted && <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
        className="fixed inset-x-3 z-[1200] mx-auto flex max-w-[560px] items-center gap-3 rounded-2xl bg-dock px-4 py-3 text-sm text-dock-foreground shadow-xl"
        style={{ bottom: 'calc(72px + var(--player-h, 0px) + env(safe-area-inset-bottom))' }}>
        <span className="flex-1">{pastedMessage}</span>
        <button type="button" className="shrink-0 font-semibold text-emerald-300" onClick={() => { edit({ body: pasted.raw }); setPasted(null); }}>Garder l’original</button>
      </motion.div>}
    </AnimatePresence>

    {conflict && <Sheet title="Modifiée ailleurs" onClose={() => {}} locked footer={<>
      <Button variant="ghost" onClick={() => void takeTheirs()}>Prendre l’autre version</Button>
      <Button onClick={keepMine}>Garder la mienne</Button>
    </>}>
      <p className="m-0 text-sm">Une autre version a été enregistrée depuis un autre appareil. Laquelle garder ?</p>
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">L’autre version</p>
      <p className="m-0 max-h-44 overflow-y-auto whitespace-pre-line rounded-xl bg-muted p-3 font-reading">{conflict.body || '(vide)'}</p>
    </Sheet>}
  </motion.div>;
}
