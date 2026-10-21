import { ArrowLeft, ExternalLink, NotebookPen, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useFlightFrom } from '../vivid/flight';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, Notice, Select, Sheet, Spinner } from '@/components/ui/kit';
import { useArticle, useArticleActions, type Article } from '../api/articles';
import { formatWhen } from '../api/episodes';
import { PreparedEpisode } from '../components/PreparedEpisode';
import { PublisherThumb } from '../explorer/FeedCards';
import { LEVEL_OPTIONS } from '../queue/PrepareDialog';
import type { PrepareOptions } from '../queue/types';
import { RelatedList } from '../related/RelatedList';
import { readingTime } from './readingTime';

type Coverage = PrepareOptions['coverage'];
const COVERAGE: Record<Coverage, { label: string; minutes: number | null }> = {
  guided: { label: 'Original guidé', minutes: null },
  essentials: { label: 'L’essentiel · 4 min', minutes: 4 }, condensed: { label: 'Condensé · 8 min', minutes: 8 }, full: { label: 'Intégral', minutes: null },
};
const COVERAGE_OPTIONS = (Object.keys(COVERAGE) as Coverage[]).map((c) => [c, COVERAGE[c].label] as const);

function PrepareArticleDialog({ article, onClose }: { article: Article; onClose: () => void }) {
  const { toNote } = useArticleActions(article.id);
  const [coverage, setCoverage] = useState<Coverage>('guided');
  const [level, setLevel] = useState<PrepareOptions['level']>('B1');
  const [done, setDone] = useState<string | null>(null);
  return <Sheet title="Préparer en anglais" onClose={onClose} locked={toNote.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={toNote.isPending}>{done ? 'Fermer' : 'Annuler'}</Button>
    {!done && <Button disabled={toNote.isPending} onClick={() => toNote.mutate(
      { coverage, level, style: 'narration', targetMinutes: COVERAGE[coverage].minutes },
      { onSuccess: (r) => setDone(r.noteId) },
    )}>{toNote.isPending ? 'Envoi…' : 'Mettre à préparer'}</Button>}
  </>}>
    <p className="m-0 text-[15px] font-semibold leading-snug">{article.title}</p>
    {done ? <Notice tone="success" action={<Button asChild size="sm" variant="ghost"><Link to={`/mind?n=${done}`} className="no-underline">Ouvrir la note</Link></Button>}>
      Préparation lancée. L’article est aussi enregistré dans My Mind ; la version anglaise apparaîtra ici et sous la note.
    </Notice> : <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Version"><Select value={coverage} options={COVERAGE_OPTIONS} onChange={(c) => {
          setCoverage(c); if (c === 'guided' && level === 'original') setLevel('B1');
        }} /></Field>
        <Field label={coverage === 'guided' ? 'Niveau des explications' : 'Niveau d’anglais'}><Select value={level}
          options={coverage === 'guided' ? LEVEL_OPTIONS.filter(([v]) => v !== 'original') : LEVEL_OPTIONS} onChange={setLevel} /></Field>
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">L’Atelier adapte le texte à ton niveau et en fait une version audio, attribuée à {article.publisher}.</p>
    </>}
    {toNote.isError && <Notice tone="error">{toNote.error.message}</Notice>}
  </Sheet>;
}

/** Lecture d'un article : texte (flux ou récupéré par l'Atelier), enregistrement dans My Mind, préparation en anglais. */
export function ArticleDetail({ id, onBack }: { id: string; onBack?: () => void }) {
  const query = useArticle(id);
  const { fetchText, toNote } = useArticleActions(id);
  const navigate = useNavigate();
  const [preparing, setPreparing] = useState(false);
  const asked = useRef<string | null>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const a = query.data;
  // Plié : la vignette du journal « vole » depuis la carte touchée dans le fil.
  useFlightFrom(a ? `pub-${a.id}` : null, thumb, !!onBack);
  // Sans texte dans le flux (The Guardian) : la récupération est demandée à l'ouverture, une fois.
  useEffect(() => {
    if (a && !a.contentText && a.contentStatus === 'none' && asked.current !== a.id) { asked.current = a.id; fetchText.mutate(); }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isPending) return <div className="grid place-items-center p-10"><Spinner /></div>;
  if (query.isError || !a) return <Notice tone="warning" className="m-4">Article introuvable.</Notice>;
  const paragraphs = (a.contentText ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const time = readingTime(a.contentText?.length ?? null);
  const noText = !a.contentText && !a.summary;

  return <motion.article initial={onBack ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
    className={`mx-auto max-w-[720px] px-4 pb-12 ${onBack ? 'pt-2' : 'pt-6'}`}>
    {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour aux articles" className="-ml-2 mb-1"><ArrowLeft className="size-5" /></Button>}
    <div className="flex items-center gap-3">
      <PublisherThumb publisher={a.publisher} thumbRef={thumb} />
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-bold uppercase tracking-[.06em] text-article">{a.publisher}</p>
        <p className="m-0 text-[13px] text-muted-foreground">{[a.author, formatWhen(a.publishedAt), time].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
    <h1 className="m-0 mt-3 font-display text-[1.9rem] font-normal leading-[1.12] tracking-tight sm:text-[2.2rem]">{a.title}</h1>
    <div className="my-4 flex flex-wrap gap-2">
      <Button onClick={() => setPreparing(true)} disabled={noText}><Sparkles className="size-4" />{a.contentId ? 'Préparer une autre version' : 'Préparer en anglais'}</Button>
      <Button variant="outline" disabled={toNote.isPending || noText} onClick={() => toNote.mutate(undefined, { onSuccess: (r) => navigate(`/mind?n=${r.noteId}`) })}>
        <NotebookPen className="size-4 text-primary" />{a.reflectionId ? 'Ouvrir dans My Mind' : 'Enregistrer dans My Mind'}
      </Button>
      <Button asChild variant="ghost"><a href={a.url} target="_blank" rel="noopener noreferrer" className="no-underline">Lire sur le site<ExternalLink className="size-4" /></a></Button>
    </div>
    {toNote.isError && <Notice tone="error" className="mb-3">{toNote.error.message}</Notice>}
    {a.contentId && <div className="mb-6"><PreparedEpisode contentId={a.contentId} about={null} /></div>}

    {a.contentStatus === 'pending' && <div className="mb-4" role="status">
      <p className="m-0 mb-1.5 text-sm text-muted-foreground">L’Atelier récupère le texte complet de l’article…</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
    </div>}
    {a.contentStatus === 'partial' && <Notice tone="warning" className="mb-4">Texte partiel : le site n’a pas tout fourni. La fin est sur le site.</Notice>}
    {a.contentStatus === 'unavailable' && !a.contentText && <Notice tone="warning" className="mb-4"
      action={<Button size="sm" variant="ghost" onClick={() => fetchText.mutate()}>Réessayer</Button>}>Texte complet inaccessible depuis le site. Le résumé est affiché.</Notice>}

    <div className="font-reading text-[1.08rem] leading-[1.8]" lang={a.language}>
      {paragraphs.length ? paragraphs.map((p, i) => <p key={i} className="m-0 mb-4 whitespace-pre-line">{p}</p>)
        : a.summary && <p className="m-0 text-muted-foreground">{a.summary}</p>}
    </div>
    <div className="mt-8"><RelatedList type="article" id={a.id} /></div>
    {preparing && <PrepareArticleDialog article={a} onClose={() => setPreparing(false)} />}
  </motion.article>;
}
