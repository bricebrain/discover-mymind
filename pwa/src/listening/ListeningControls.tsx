import { Moon, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../player/PlayerProvider';
import { readAutoplayNext, writeAutoplayNext } from './nextUp';
import { playReturnPoint, returnPointStore, useReturnPoint } from './returnPoint';
import { SLEEP_CHOICES, sleepRemainingSec, sleepStore, useSleep } from './sleep';

/** mm:ss, comme l'horloge du lecteur (copie locale : le module lecteur importe celui-ci). */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Minuterie de sommeil (bouton + menu) : 15 / 30 / 45 min ou fin de l'épisode (I5). */
export function SleepButton() {
  const sleep = useSleep();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // État visible : le compte à rebours avance tant qu'une échéance horloge est active.
  useEffect(() => {
    if (!sleep || sleep.endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sleep]);
  const remaining = sleepRemainingSec(sleep, now);
  return <div className="relative">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
      aria-label={sleep ? (sleep.endsAt === null ? 'Minuterie : fin de l’épisode' : `Arrêt dans ${clock(remaining ?? 0)}`) : 'Minuterie de sommeil'}
      className={cn('grid h-11 min-w-11 place-items-center rounded-xl border px-2 text-xs font-bold tabular-nums transition-colors active:scale-95',
        sleep ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-foreground')}>
      {sleep ? (sleep.endsAt === null ? <Moon className="size-[18px] fill-current" /> : clock(remaining ?? 0)) : <Moon className="size-[18px]" />}
    </button>
    {open && <>
      <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
      <div role="menu" aria-label="Minuterie de sommeil" className="absolute bottom-full right-0 z-20 mb-2 w-52 overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,.35)]">
        {SLEEP_CHOICES.map((choice) => <button key={String(choice.value)} type="button" role="menuitemradio" aria-checked={sleep?.mode === choice.value}
          onClick={() => { sleepStore.start(choice.value); setOpen(false); }}
          className={cn('block w-full rounded-xl px-3 py-2.5 text-left text-sm', sleep?.mode === choice.value ? 'bg-primary-soft font-semibold text-primary' : 'hover:bg-muted')}>{choice.label}</button>)}
        {sleep && <button type="button" role="menuitem" onClick={() => { sleepStore.cancel(); setOpen(false); }}
          className="mt-1 block w-full rounded-xl border-t border-border px-3 py-2.5 text-left text-sm text-article hover:bg-muted">Annuler la minuterie</button>}
      </div>
    </>}
  </div>;
}

/** Enchaînement « lire ensuite les téléchargements » (I5). */
export function AutoplayNextToggle() {
  const [autoplay, setAutoplay] = useState(() => readAutoplayNext());
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
    <span className="text-sm font-medium">Lire ensuite les téléchargements</span>
    <input type="checkbox" role="switch" checked={autoplay} onChange={(e) => { setAutoplay(e.target.checked); writeAutoplayNext(e.target.checked); }}
      className="peer sr-only" />
    <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-primary after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
  </label>;
}

/** « Revenir à la version B1 » : reprend la version adaptée à l'endroit quitté avant le saut vers l'original (I3). */
export function ReturnToVersionButton({ onClose }: { onClose: () => void }) {
  const point = useReturnPoint();
  const player = usePlayer();
  const navigate = useNavigate();
  // Visible seulement sur l'original rejoint par le saut : ailleurs, il n'y a rien à reprendre.
  const onOriginal = !!point?.jumpedTo && player.track !== null
    && player.track.targetType === point.jumpedTo.targetType
    && player.track.targetId === point.jumpedTo.targetId
    && player.track.audioRef === point.jumpedTo.audioRef;
  if (!point || !onOriginal) return null;
  const back = () => {
    if (point.track) playReturnPoint(point, player);
    else returnPointStore.clear();
    navigate(`/library/${point.contentId}?v=${encodeURIComponent(point.variantKey)}`);
    onClose();
  };
  return <Button variant="outline" size="sm" onClick={back}>
    <Undo2 className="size-4" />{`Revenir à ${point.label}${point.positionSec !== undefined ? ` (reprendre à ${clock(point.positionSec)})` : ''}`}
  </Button>;
}

/** État toujours visible, même quand le lecteur complet est replié. */
export function ListeningStatus() {
  const sleep = useSleep();
  if (!sleep) return null;
  return <span role="status">{sleep.mode === 'end' ? 'Arrêt en fin d’épisode · ' : `Minuterie ${sleep.mode} min · `}</span>;
}
