import { Bookmark, Captions, ChevronRight, Pause, Play } from 'lucide-react';
import { motion } from 'motion/react';
import type { ArticleSummary } from '../api/articles';
import { formatDuration, formatWhen, type Episode } from '../api/episodes';
import { categoryColor } from '../app/theme';
import { cn } from '@/lib/utils';
import { formatClock } from '../player/MiniPlayer';
import { usePlayer } from '../player/PlayerProvider';
import { trackOf } from '../player/trackOf';
import { publisherMark } from './feed';
import { SelectableCard } from '../selection/SelectableCard';
import { readingTime } from '../articles/readingTime';

/** Petit égaliseur animé : « en cours de lecture ». */
export function PlayingBars({ active }: { active: boolean }) {
  return <span aria-hidden className="inline-flex h-3 items-end gap-[2px]">
    {[0, 1, 2].map((i) => <span key={i} className={cn('w-[3px] rounded-sm bg-article', active ? 'animate-[eq_.9s_ease-in-out_infinite_alternate]' : 'h-1')}
      style={active ? { animationDelay: `${i * 0.15}s` } : undefined} />)}
  </span>;
}

const cardBase = 'group relative flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors';

/** Épisode de podcast ou vidéo YouTube : pochette, source, titre, méta, progression ; lecture directe. */
export function EpisodeFeedCard({ episode, selected, onOpen, index }: { episode: Episode; selected?: boolean; onOpen: () => void; index: number }) {
  const player = usePlayer();
  const youtube = episode.sourceType === 'youtube';
  const current = player.track?.targetType === 'episode' && player.track.targetId === episode.id;
  const playing = current && player.playing;
  const unseen = episode.state === 'new';
  const color = categoryColor(episode.category, 'light');
  const inProgress = !current && !!episode.progressMs && !!episode.progressDurationMs && episode.progressCompleted !== 1;
  const pct = current && player.duration > 0 ? (player.position / player.duration) * 100 : inProgress ? (episode.progressMs! / episode.progressDurationMs!) * 100 : 0;
  const act = () => (youtube ? onOpen() : current ? player.toggle() : player.play(trackOf(episode)));

  return <SelectableCard item={{ type: 'episode', id: episode.id, title: episode.title }}><motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
    className={cn(cardBase, selected ? 'border-primary/40 bg-primary-soft' : 'border-border/70 bg-card hover:bg-muted/60')}>
    <button type="button" data-selection-surface onClick={onOpen} aria-current={selected ? 'true' : undefined} className="flex min-w-0 flex-1 items-start gap-3 text-left active:scale-[.99]">
      <span className="relative shrink-0">
        {episode.imageUrl
          ? <img src={episode.imageUrl} alt="" loading="lazy" className="size-14 rounded-xl object-cover" />
          : <span className="grid size-14 place-items-center rounded-xl text-lg font-bold" style={{ background: `${color}22`, color }}>{episode.showTitle.slice(0, 1)}</span>}
        {youtube && <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-md bg-youtube text-white ring-2 ring-card"><Play className="ml-px size-2.5 fill-current" /></span>}
        {unseen && <span aria-label="Nouveau" className="absolute -right-1 -top-1 size-3 rounded-full bg-article ring-2 ring-card" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: youtube ? 'var(--youtube)' : color }} />
          <span className={cn('truncate font-semibold', youtube ? 'text-youtube' : 'text-primary')}>{episode.showTitle}</span>
        </span>
        <span className={cn('mt-0.5 line-clamp-2 text-[15px] leading-snug', unseen ? 'font-semibold' : 'font-medium', episode.progressCompleted === 1 ? 'text-muted-foreground' : 'text-foreground')}>{episode.title}</span>
        <span className="mt-1 flex min-h-[18px] items-center gap-1.5 text-xs text-muted-foreground">
          {current && <PlayingBars active={playing} />}
          <span>{current ? `${formatClock(player.position)} / ${formatClock(player.duration)}`
            : [formatWhen(episode.publishedAt), formatDuration(episode.durationSec), youtube ? 'vidéo' : null, episode.language.toUpperCase()].filter(Boolean).join(' · ')}</span>
          {episode.transcriptType && <Captions className="size-3.5" aria-label="Transcription disponible" />}
          {episode.state === 'saved' && <Bookmark className="size-3.5 fill-primary text-primary" aria-label="Sauvegardé" />}
          {episode.progressCompleted === 1 && <span className="font-semibold text-primary">· écouté</span>}
        </span>
        {episode.contentId && <span className="mt-1.5 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">Version anglaise prête</span>}
        {pct > 0 && <span aria-label="Progression d’écoute" className="mt-1.5 block h-[3px] max-w-44 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-article" style={{ width: `${Math.min(pct, 100)}%` }} />
        </span>}
      </span>
    </button>
    <button type="button" onClick={act} aria-label={youtube ? `Ouvrir ${episode.title}` : playing ? `Mettre en pause ${episode.title}` : `Écouter ${episode.title}`}
      className={cn('grid size-11 shrink-0 place-items-center self-center rounded-full transition-transform active:scale-90',
        current ? 'bg-primary text-primary-foreground' : youtube ? 'bg-youtube-soft text-youtube' : 'bg-foreground text-background')}>
      {youtube ? <ChevronRight className="size-5" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
    </button>
  </motion.article></SelectableCard>;
}

/** Vignette d'un journal : abréviation sur sa couleur. */
export function PublisherThumb({ publisher, size = 'md' }: { publisher: string; size?: 'md' | 'lg' }) {
  const m = publisherMark(publisher);
  return <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-xl font-display leading-none tracking-tight shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]',
    size === 'lg' ? 'size-16 text-3xl' : 'size-14', size === 'md' && (m.mark.length > 2 ? 'text-lg' : m.mark.length > 1 ? 'text-2xl' : 'text-[2rem]'))}
    style={{ background: m.bg, color: m.fg }}>{m.mark}</span>;
}


/** Article : vignette du journal, journal, date, temps de lecture, titre ; même fil que les épisodes. */
export function ArticleFeedCard({ article, selected, onOpen, index }: { article: ArticleSummary; selected?: boolean; onOpen: () => void; index: number }) {
  const time = readingTime(article.contentLength);
  return <SelectableCard item={{ type: 'article', id: article.id, title: article.title }}><motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
    className={cn(cardBase, selected ? 'border-primary/40 bg-primary-soft' : 'border-border/70 bg-card hover:bg-muted/60')}>
    <button type="button" data-selection-surface onClick={onOpen} aria-current={selected ? 'true' : undefined} className="flex min-w-0 flex-1 items-start gap-3 text-left active:scale-[.99]">
      <PublisherThumb publisher={article.publisher} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate font-semibold text-article">{article.publisher}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{article.title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{[formatWhen(article.publishedAt), time, 'article', article.language.toUpperCase()].filter(Boolean).join(' · ')}</span>
        {article.contentId && <span className="mt-1.5 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">Version anglaise prête</span>}
      </span>
    </button>
    <button type="button" onClick={onOpen} aria-label={`Lire ${article.title}`}
      className="grid size-11 shrink-0 place-items-center self-center rounded-full bg-article-soft text-article transition-transform active:scale-90">
      <ChevronRight className="size-5" />
    </button>
  </motion.article></SelectableCard>;
}

/** « À reprendre » : la dernière écoute commencée, en grande carte sarcelle. */
export function ResumeFeedCard({ episode }: { episode: Episode }) {
  const player = usePlayer();
  const pct = (episode.progressMs! / episode.progressDurationMs!) * 100;
  const left = (episode.progressDurationMs! - episode.progressMs!) / 1000;
  return <motion.button type="button" onClick={() => player.play(trackOf(episode))} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}
    className="relative flex w-full items-center gap-3 overflow-hidden rounded-[22px] bg-[#0d3b36] p-3 text-left text-white shadow-[0_16px_34px_-18px_rgb(13_59_54/0.9)]">
    {/* Pochette agrandie et floutée en fond : la carte prend la couleur de l'émission. */}
    {episode.imageUrl && <img src={episode.imageUrl} alt="" aria-hidden className="art-breathe absolute inset-0 size-full object-cover opacity-70 blur-2xl" />}
    <span aria-hidden className="absolute inset-0 bg-black/30" />
    {episode.imageUrl ? <img src={episode.imageUrl} alt="" className="relative size-[54px] shrink-0 rounded-xl object-cover shadow-lg" /> : <span className="relative size-[54px] shrink-0 rounded-xl bg-white/20" />}
    <span className="relative min-w-0 flex-1">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/80">À reprendre · encore {formatClock(left)}</span>
      <span className="block truncate text-[15px] font-semibold">{episode.title}</span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/25"><motion.span className="block h-full rounded-full bg-white"
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} /></span>
    </span>
    <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#18181b]"><Play className="ml-0.5 size-4 fill-current" /></span>
  </motion.button>;
}
