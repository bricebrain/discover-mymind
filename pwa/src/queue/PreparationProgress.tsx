import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { STAGES } from './options';
import type { QueueItem, QueueWaiting } from './types';

/** Libellés courts des étapes, pour la frise. */
const SHORT: Record<string, string> = {
  download: 'Source', normalize: 'Audio', transcribe: 'Transcription', plan: 'Plan', extract: 'Analyse', adapt: 'Adaptation',
  evaluate: 'Contrôle', translate: 'Fidèle', tts: 'Voix', publish: 'Publication',
};

export function formatRemaining(sec: number) {
  if (sec < 45) return 'moins d’une minute';
  const min = Math.round(sec / 60);
  if (min < 60) return `environ ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `environ ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/**
 * Avancement d'une préparation en cours : frise des étapes (faites, en cours, à venir), barre lumineuse, pourcentage,
 * étape courante et temps restant estimé (décompte entre deux rafraîchissements).
 */
export function PreparationProgress({ item, fetchedAt }: { item: QueueItem; fetchedAt: number }) {
  const p = item.progress;
  const now = useNow(!!p);
  if (!p) return null;
  const sinceFetch = Math.max(0, (now - fetchedAt) / 1000);
  const remaining = Math.max(5, p.remainingSec - sinceFetch);
  const started = p.startedAt ? Math.max(0, (now - Date.parse(p.startedAt)) / 1000) : null;
  const stage = item.stage ?? p.stages[p.current] ?? '';
  return <div className="mt-2.5 flex flex-col gap-2" role="status" aria-live="polite">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[13px] font-semibold">
        Étape {p.current + 1}/{p.stages.length} · {STAGES[stage] ?? stage}
      </span>
      <motion.span key={p.percent} initial={{ scale: 1.15, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}
        className="text-[18px] font-bold tabular-nums text-primary">{p.percent}%</motion.span>
    </div>
    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
      <motion.div className="absolute inset-y-0 left-0 rounded-full bg-grad-primary" initial={false} animate={{ width: `${p.percent}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
      <div className="progress-slide absolute inset-y-0 w-1/4 rounded-full bg-white/35" />
    </div>
    <ol className="m-0 flex list-none items-center gap-1 p-0" aria-label="Étapes de la préparation">
      {p.stages.map((s, i) => {
        const done = i < p.current, current = i === p.current;
        return <li key={s} title={STAGES[s] ?? s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className={cn('relative grid size-5 place-items-center rounded-full text-[10px] font-bold transition-colors',
            done ? 'bg-primary text-primary-foreground' : current ? 'bg-primary-soft text-primary ring-2 ring-primary' : 'bg-muted text-muted-foreground')}>
            {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            {current && <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />}
          </span>
          <span className={cn('w-full truncate text-center text-[9.5px] leading-none', current ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{SHORT[s] ?? s}</span>
        </li>;
      })}
    </ol>
    <p className="m-0 text-xs text-muted-foreground">
      Fin {formatRemaining(remaining)}{started !== null ? ` · commencé il y a ${formatRemaining(started).replace('environ ', '')}` : ''}
      {!p.history && ' · estimation affinée au fil des préparations'}
    </p>
  </div>;
}

/**
 * Demande en file pour le Mac : sa place, la demande qui passe avant et l'heure de début estimée ; signale aussi un Atelier
 * silencieux depuis plusieurs minutes (Mac éteint ou préparateur arrêté).
 */
export function AtelierHint({ seenAt, waiting }: { seenAt: string | null; waiting?: QueueWaiting | null }) {
  const now = useNow(true);
  const age = seenAt ? (now - Date.parse(seenAt)) / 1000 : Infinity;
  if (age >= 180) return <p className="m-0 mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
    <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
    {seenAt ? `Atelier silencieux depuis ${formatRemaining(age).replace('environ ', '')}` : 'Atelier pas encore vu'} : allume le Mac, ou prépare sans Mac.
  </p>;
  if (waiting && waiting.ahead > 0) return <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
    <p className="m-0 flex items-center gap-1.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">{waiting.position}</span>
      <span>En file · {waiting.ahead === 1 ? 'une préparation passe avant' : `${waiting.ahead} préparations passent avant`}
        {waiting.aheadTitle ? <> : « <span className="font-medium text-foreground">{waiting.aheadTitle.length > 40 ? `${waiting.aheadTitle.slice(0, 39)}…` : waiting.aheadTitle}</span> »</> : null}</span>
    </p>
    <p className="m-0 pl-[26px]">Début dans {formatRemaining(waiting.startInSec)} · le Mac prépare une demande à la fois</p>
  </div>;
  return <p className="m-0 mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />Atelier en ligne · la préparation va commencer
  </p>;
}
