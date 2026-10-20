import { ArrowLeft, Bookmark, ExternalLink, EyeOff, NotebookPen, Pause, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice, Spinner } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, formatDuration, formatWhen, useEpisode, useSetEpisodeState } from '../api/episodes';
import { categoryColor } from '../app/theme';
import { PlayingBars } from '../explorer/FeedCards';
import { formatClock } from '../player/MiniPlayer';
import { usePlayer } from '../player/PlayerProvider';
import { trackOf } from '../player/trackOf';
import { useNewNote } from '../pages/MindPage';
import { PreparationPanel } from '../queue/PreparationPanel';
import { TranscriptView } from '../transcript/TranscriptView';
import { RelatedList } from '../related/RelatedList';
import { PreparedEpisode } from './PreparedEpisode';
import { useFlightFrom } from '../vivid/flight';

/** Onglets soulignés (Transcription / À propos), barre active animée. */
export function UnderlineTabs<T extends string>({ value, onChange, options, id }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; id: string;
}) {
  return <div role="tablist" className="mb-4 flex gap-5 border-b border-border">
    {options.map(([v, l]) => {
      const on = v === value;
      return <button key={v} type="button" role="tab" aria-selected={on} onClick={() => onChange(v)}
        className={cn('relative min-h-11 text-[15px] font-semibold transition-colors', on ? 'text-foreground' : 'text-muted-foreground')}>
        {l}
        {on && <motion.span layoutId={`${id}-underline`} className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-primary" />}
      </button>;
    })}
  </div>;
}

const iconBtn = 'size-11 rounded-full border border-border bg-card/80 backdrop-blur';

/** Détail d'un épisode : en-tête sur la pochette floutée, écoute, transcription ou présentation. */
export function EpisodeDetail({ id, onBack }: { id: string; onBack?: () => void }) {
  const { data: episode, isPending, isError } = useEpisode(id);
  const setState = useSetEpisodeState();
  const player = usePlayer();
  const [tab, setTab] = useState<'transcript' | 'about'>('transcript');
  const newNote = useNewNote();
  const art = useRef<HTMLImageElement>(null);
  // Plié : la pochette « vole » depuis la carte touchée dans le fil.
  useFlightFrom(episode ? `art-${episode.id}` : null, art, !!onBack && !!episode?.imageUrl);

  // Ouvrir un épisode le marque comme vu.
  useEffect(() => {
    if (episode?.state === 'new') setState.mutate({ id: episode.id, state: 'seen' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, episode?.state]);

  if (isPending) return <div className="grid place-items-center p-10"><Spinner /></div>;
  if (isError || !episode) return <Notice tone="warning" className="m-4">Épisode introuvable.</Notice>;

  const youtube = episode.sourceType === 'youtube';
  const saved = episode.state === 'saved';
  const isCurrent = player.track?.targetType === 'episode' && player.track.targetId === episode.id;
  const resumeAt = !isCurrent && episode.progressMs && episode.progressCompleted !== 1 && episode.progressMs > 5000 ? episode.progressMs / 1000 : null;
  const listen = () => (isCurrent ? player.toggle() : player.play(trackOf(episode)));
  const color = categoryColor(episode.category);
  const pct = isCurrent && player.duration > 0 ? (player.position / player.duration) * 100
    : resumeAt && episode.progressDurationMs ? (episode.progressMs! / episode.progressDurationMs) * 100 : 0;
  const about = episode.description
    ? <p className="m-0 whitespace-pre-line font-reading text-[1.05rem] leading-[1.75] text-foreground/90">{episode.description}</p>
    : null;

  return <motion.article initial={onBack ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="pb-8">
    {/* En-tête : pochette floutée en fond, fondue dans la page */}
    <header className={cn('relative overflow-hidden px-4 pb-5', onBack ? 'pt-2' : 'pt-6')}>
      {episode.imageUrl && <div aria-hidden className="absolute -inset-16 bg-cover bg-center opacity-35 blur-[60px] saturate-150 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
        style={{ backgroundImage: `url("${episode.imageUrl}")` }} />}
      <div className="relative mx-auto max-w-[720px]">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour à la liste" className="-ml-2 mb-2"><ArrowLeft className="size-5" /></Button>}
        <div className="mb-4 flex items-end gap-4">
          {episode.imageUrl
            ? <img ref={art} src={episode.imageUrl} alt="" className="relative z-10 size-28 shrink-0 rounded-2xl object-cover shadow-[0_14px_34px_rgba(0,0,0,.22)]" />
            : <span className="grid size-28 shrink-0 place-items-center rounded-2xl font-display text-5xl" style={{ background: `${color}2e`, color }}>{episode.showTitle.slice(0, 1)}</span>}
          <div className="min-w-0 pb-1">
            <p className="m-0 text-sm font-semibold">{youtube ? 'YouTube · ' : ''}{episode.showTitle}</p>
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: color }} />
              <span className="font-semibold">{CATEGORY_LABELS[episode.category]}</span>
              <span>· {episode.language === 'fr' ? 'Français' : 'Anglais'}</span>
              <span>· {[formatWhen(episode.publishedAt), formatDuration(episode.durationSec)].filter(Boolean).join(' · ')}</span>
            </p>
          </div>
        </div>

        <h1 className="m-0 mb-5 font-display text-[1.75rem] font-normal leading-[1.15] tracking-tight sm:text-[2rem]">{episode.title}</h1>

        <PreparationPanel key={episode.id} episode={episode} />
        <div className="flex items-center gap-2">
          {/* Épisode préparé : l'écoute se choisit par version, plus bas (l'original y figure aussi). */}
          {youtube && <Button asChild variant="outline"><a href={episode.audioUrl} target="_blank" rel="noreferrer" className="no-underline">
            <ExternalLink className="size-4 text-youtube" />Voir sur YouTube</a></Button>}
          {!youtube && !episode.contentId && <Button onClick={listen} className="relative h-12 overflow-hidden px-6 text-[15px]">
            {isCurrent && player.playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
            {isCurrent ? (player.playing ? 'Pause' : 'Reprendre') : resumeAt ? `Reprendre à ${formatClock(resumeAt)}` : 'Écouter'}
            {pct > 0 && <span aria-hidden className="absolute bottom-0 left-0 h-[3px] bg-article" style={{ width: `${pct}%` }} />}
          </Button>}
          {!youtube && !episode.contentId && isCurrent && player.playing && <PlayingBars active />}
          <span className="flex-1" />
          <Button variant="ghost" size="icon" className={iconBtn} title="Réfléchir : écrire une note liée à cet épisode"
            aria-label="Réfléchir : écrire une note liée à cet épisode"
            onClick={() => void newNote([{ targetType: 'episode', targetId: episode.id, targetTitle: `${episode.title} — ${episode.showTitle}` }])}>
            <NotebookPen className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" className={cn(iconBtn, saved && 'text-primary')} disabled={setState.isPending}
            title={saved ? 'Retirer de la bibliothèque' : 'Sauvegarder'} aria-label={saved ? 'Retirer de la bibliothèque' : 'Sauvegarder'} aria-pressed={saved}
            onClick={() => setState.mutate({ id: episode.id, state: saved ? 'seen' : 'saved' })}>
            <Bookmark className={cn('size-5', saved && 'fill-current')} />
          </Button>
          {!saved && <Button variant="ghost" size="icon" className={iconBtn} title="Écarter de l’Explorer" aria-label="Écarter de l’Explorer"
            onClick={() => { setState.mutate({ id: episode.id, state: 'dismissed' }); onBack?.(); }}>
            <EyeOff className="size-5" />
          </Button>}
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[720px] px-4">
      {episode.contentId ? <PreparedEpisode showId={episode.showId} contentId={episode.contentId} about={about} /> : <>
        {episode.transcriptType && <UnderlineTabs id={`ep-${episode.id}`} value={tab} onChange={setTab}
          options={[['transcript', 'Transcription'], ['about', 'À propos']] as const} />}
        {episode.transcriptType && tab === 'transcript'
          ? <TranscriptView episode={episode} onPlay={listen} />
          : about ?? <p className="text-muted-foreground">Pas de présentation pour cet épisode.</p>}
      </>}
      <div className="mt-8"><RelatedList type="episode" id={episode.id} /></div>
    </div>
  </motion.article>;
}
