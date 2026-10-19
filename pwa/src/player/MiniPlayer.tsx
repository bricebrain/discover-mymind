import { useState } from 'react';
import { Loader2, Pause, Play, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Button as UiButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ListeningStatus } from '../listening/ListeningControls';
import { FullPlayerSheet } from './FullPlayerSheet';
import { useListeningAutomation } from '../listening/useListeningAutomation';
import { usePlayer } from './PlayerProvider';

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Hauteur réservée par le mini-lecteur (carte de 64 px + marge), lue par les mises en page via --player-h. */
export const MINI_PLAYER_SPACE = 72;

/** Mini-lecteur persistant : capsule sombre flottante au-dessus de la navigation ; un toucher ouvre le lecteur complet. */
export function MiniPlayer() {
  const player = usePlayer();
  const { track, position, duration, error, stop, playing, buffering, toggle } = player;
  // Minuterie de sommeil et enchaînement (I5) : actifs tant que le lecteur existe.
  useListeningAutomation(player);
  const [open, setOpen] = useState(false);
  if (!track) return null;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <>
      <div className="mx-auto max-w-[760px] px-2 pt-2">
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="relative h-16 overflow-hidden rounded-2xl bg-dock text-dock-foreground shadow-[0_16px_40px_-14px_rgba(0,0,0,.45)]">
          <div className="flex h-full items-center gap-1 pl-2 pr-1.5">
            <button type="button" onClick={() => setOpen(true)} aria-label="Ouvrir le lecteur"
              className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left active:scale-[.99]">
              {track.imageUrl
                ? <img src={track.imageUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
                : <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{track.title.slice(0, 1)}</span>}
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold">{track.title}</span>
                <span className={cn('block truncate text-xs', error ? 'text-red-300' : 'text-dock-foreground/65')}>
                  <ListeningStatus />{error ?? `${track.subtitle} · ${formatClock(position)} / ${formatClock(duration)}`}
                </span>
              </span>
            </button>
            <UiButton variant="dock" size="icon-sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'}>
              {buffering && playing ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
            </UiButton>
            <button type="button" onClick={stop} aria-label="Fermer le lecteur"
              className="grid size-10 place-items-center rounded-full text-dock-foreground/60 transition-colors hover:text-dock-foreground active:scale-95">
              <X className="size-4" />
            </button>
          </div>
          <div aria-hidden className="absolute bottom-0 left-0 h-[3px] bg-primary transition-[width] duration-300 ease-linear" style={{ width: `${progress}%` }} />
        </motion.div>
      </div>
      <FullPlayerSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
