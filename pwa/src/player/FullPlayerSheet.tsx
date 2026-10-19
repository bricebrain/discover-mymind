import { ChevronDown, FileText, Loader2, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer } from 'vaul';
import { ActiveListeningControls } from '../listening/ActiveListeningControls';
import { useContent } from '../api/contents';
import { variantName, variantTrack, languageName } from '../content/variants';
import { AutoplayNextToggle, ReturnToVersionButton, SleepButton } from '../listening/ListeningControls';
import { cn } from '@/lib/utils';
import { formatClock } from './MiniPlayer';
import { SKIP_SECONDS, SPEEDS, usePlayer } from './PlayerProvider';

/** Pastilles de version d'un contenu préparé : passer de l'adaptation à l'original sans quitter le lecteur. */
function VersionPills({ contentId, currentKey }: { contentId: string; currentKey: string }) {
  const player = usePlayer();
  const content = useContent(contentId);
  const variants = (content.data?.variants ?? []).filter((v) => v.audio);
  if (variants.length < 2) return null;
  return <div role="radiogroup" aria-label="Version" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {variants.map((v) => {
      const on = v.key === currentKey;
      return <button key={v.key} type="button" role="radio" aria-checked={on}
        onClick={() => { const t = content.data && variantTrack(content.data, v); if (t && !on) player.play(t, { autoplay: player.playing || player.buffering }); }}
        className={cn('h-10 shrink-0 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition-colors active:scale-95',
          on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-foreground')}>
        {variantName(v)} · {languageName(v.language)}
      </button>;
    })}
  </div>;
}

/**
 * Lecteur complet (refonte, étape 4) : volet qui monte du bas et se ferme en glissant (vaul, utilisé par shadcn/ui).
 * Pochette, versions, progression, vitesse, sauts de 10 s, minuterie, enchaînement des téléchargements.
 */
export function FullPlayerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = usePlayer();
  const { track, position, duration, rate, error, seek, skip, setRate, playing, buffering, toggle } = player;
  const [scrub, setScrub] = useState<number | null>(null);
  if (!track) return null;
  const shown = scrub ?? position;
  const variant = track.targetType === 'variant' ? track.targetId.split(':') as [string, string] : null;
  const nextRate = SPEEDS[(SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1;
  const pct = duration > 0 ? (shown / duration) * 100 : 0;

  return <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }} shouldScaleBackground={false}>
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-[1300] bg-zinc-900/40" />
      <Drawer.Content aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-[1300] mx-auto flex max-h-[94dvh] max-w-[640px] flex-col overflow-hidden rounded-t-[28px] bg-background font-sans text-foreground outline-none">
        {/* Fond : la pochette floutée, très atténuée. */}
        {track.imageUrl && <div aria-hidden className="pointer-events-none absolute -inset-10 bg-cover bg-center opacity-25 blur-3xl saturate-150" style={{ backgroundImage: `url("${track.imageUrl}")` }} />}
        <div className="relative flex justify-center pt-2.5"><span className="h-[5px] w-10 rounded-full bg-zinc-300" aria-hidden /></div>
        <div className="relative flex items-center justify-between px-3 pt-1">
          <button type="button" onClick={onClose} aria-label="Réduire le lecteur" className="grid size-11 place-items-center rounded-full active:scale-95"><ChevronDown className="size-6" /></button>
          <Drawer.Title className="truncate px-2 text-[13px] font-semibold text-muted-foreground">{track.subtitle}</Drawer.Title>
          <span className="size-11" />
        </div>

        <div className="relative flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 [&>*]:shrink-0">
          <div className="flex justify-center">
            {track.imageUrl
              ? <img src={track.imageUrl} alt="" className="aspect-square w-[min(62vw,250px)] rounded-[28px] object-cover shadow-[0_24px_50px_-18px_rgba(0,0,0,.45)]" />
              : <div className="grid aspect-square w-[min(62vw,250px)] place-items-center rounded-[28px] bg-gradient-to-br from-[#2f7d73] to-[#0d3b36] font-display text-7xl text-white shadow-[0_24px_50px_-18px_rgba(13,95,86,.6)]">{track.title.slice(0, 1)}</div>}
          </div>
          <div className="text-center">
            <h2 className="font-display text-[1.9rem] leading-[1.1]">{track.title}</h2>
          </div>
          {variant && <VersionPills contentId={variant[0]} currentKey={variant[1]} />}
          <div className="flex justify-center"><ReturnToVersionButton onClose={onClose} /></div>
          {error && <p className="rounded-xl bg-article-soft p-3 text-sm text-article">{error}</p>}

          <div>
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div aria-hidden className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-white" style={{ left: `${pct}%` }} />
              <input type="range" aria-label="Position" min={0} max={Math.max(duration, 1)} step={1} value={shown}
                onChange={(e) => setScrub(Number(e.target.value))}
                onPointerUp={() => { if (scrub !== null) { seek(scrub); setScrub(null); } }}
                onKeyUp={() => { if (scrub !== null) { seek(scrub); setScrub(null); } }}
                className="absolute inset-0 w-full cursor-pointer opacity-0" />
            </div>
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{formatClock(shown)}</span><span>−{formatClock(Math.max(duration - shown, 0))}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setRate(nextRate)} aria-label={`Vitesse ${rate}×, passer à ${nextRate}×`}
              className="h-11 min-w-11 rounded-xl border border-border bg-card px-2 text-[13px] font-bold tabular-nums active:scale-95">{String(rate).replace('.', ',')}×</button>
            <button type="button" onClick={() => skip(-SKIP_SECONDS)} aria-label={`Reculer de ${SKIP_SECONDS} secondes`}
              className="relative grid size-14 place-items-center rounded-full bg-muted active:scale-95"><RotateCcw className="size-6" /><span className="absolute text-[9px] font-bold">10</span></button>
            <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'}
              className="grid size-[76px] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_16px_32px_-12px_var(--primary)] active:scale-95">
              {buffering && playing ? <Loader2 className="size-8 animate-spin" /> : playing ? <Pause className="size-8 fill-current" /> : <Play className="ml-1 size-8 fill-current" />}
            </button>
            <button type="button" onClick={() => skip(SKIP_SECONDS)} aria-label={`Avancer de ${SKIP_SECONDS} secondes`}
              className="relative grid size-14 place-items-center rounded-full bg-muted active:scale-95"><RotateCw className="size-6" /><span className="absolute text-[9px] font-bold">10</span></button>
            <SleepButton />
          </div>

          <ActiveListeningControls controls={player.activeListening} />
          {variant && <Link to={`/library/${variant[0]}?v=${variant[1]}`} onClick={onClose}
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold text-foreground no-underline active:scale-[.98]">
            <FileText className="size-4" />Lire la transcription
          </Link>}
          <AutoplayNextToggle />
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>;
}
