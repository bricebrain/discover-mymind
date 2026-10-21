import { Ear, EyeOff, Headphones, Play, ScrollText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useContentSegments, type ContentDetail, type ContentGuide, type ContentSegment, type ContentVariant } from '../api/contents';
import { usePlayer } from '../player/PlayerProvider';
import { formatClock } from '../player/MiniPlayer';

export interface GuidePassage { guide: ContentGuide; startMs: number; endMs: number }

/** Bornes du passage de travail, seulement si le guide renvoie à des passages horodatés de ce document. */
export function guidePassage(guide: ContentGuide | undefined, segments: ContentSegment[]): GuidePassage | null {
  if (!guide) return null;
  const from = segments.find((s) => s.id === guide.passage.fromSegment), to = segments.find((s) => s.id === guide.passage.toSegment);
  if (from?.startMs == null || to?.endMs == null || to.endMs <= from.startMs) return null;
  return { guide, startMs: from.startMs, endMs: to.endMs };
}

const STEPS = [
  { title: 'Écouter sans le texte', hint: 'Le sujet général, sans chercher chaque mot.', icon: Headphones, hide: true },
  { title: 'Comprendre', hint: 'Réécoute avec le texte ; le français et les expressions seulement là où ça bloque.', icon: ScrollText, hide: false },
  { title: 'Réécouter sans le texte', hint: 'Reconnais-tu maintenant les expressions à l’oreille ?', icon: EyeOff, hide: true },
] as const;

/**
 * Original guidé : un passage de 2 à 5 minutes travaillé en trois écoutes, puis le quiz.
 * Le lecteur s'arrête à la fin du passage ; le texte est masqué pendant les écoutes sans aide.
 */
export function GuidePanel({ detail, variant, playing, positionSec, onPlay, onHideText }: {
  detail: ContentDetail; variant: ContentVariant; playing: boolean; positionSec: number;
  onPlay: (positionSec: number) => void; onHideText: (hidden: boolean) => void;
}) {
  const player = usePlayer();
  const segments = useContentSegments(detail.publicationId, variant);
  const [step, setStep] = useState<number | null>(null);
  const listening = useRef(false);
  const passage = segments.data ? guidePassage(segments.data.guide, segments.data.segments) : null;

  // Arrêt à la fin du passage pendant une écoute guidée ; toute autre lecture reste libre.
  useEffect(() => {
    if (!passage || !listening.current || !playing) return;
    if (positionSec * 1000 >= passage.endMs) { listening.current = false; player.pause(); }
  }, [passage, playing, positionSec, player]);
  useEffect(() => () => onHideText(false), [onHideText]);

  if (!passage) return null;
  const { guide } = passage;
  const segmentStart = (id: string) => segments.data!.segments.find((s) => s.id === id)?.startMs ?? passage.startMs;
  const start = (index: number) => {
    setStep(index);
    onHideText(STEPS[index]!.hide);
    listening.current = true;
    onPlay(passage.startMs / 1000);
  };

  return <section aria-label="Original guidé" className={`${cardCls} mt-5 space-y-4 p-4`}>
    <div>
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">
        Original guidé · {guide.voice === 'original' ? 'audio original' : 'voix de synthèse'} · explications {guide.level}
      </p>
      <h2 className="m-0 mt-1 font-display text-2xl font-normal">
        Passage {formatClock(passage.startMs / 1000)} – {formatClock(passage.endMs / 1000)}
      </h2>
      {guide.passage.reason && <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">{guide.passage.reason}</p>}
    </div>

    <ol className="m-0 grid list-none gap-2 p-0">
      {STEPS.map((s, i) => <li key={s.title}>
        <Button variant={step === i ? 'default' : 'outline'} className="h-auto min-h-14 w-full justify-start whitespace-normal py-2 text-left"
          aria-current={step === i ? 'step' : undefined} onClick={() => start(i)}>
          <s.icon className="size-5 shrink-0" />
          <span><span className="block font-semibold">{i + 1}. {s.title}</span><span className="block text-xs font-normal opacity-80">{s.hint}</span></span>
        </Button>
      </li>)}
      <li className="px-1 text-sm text-muted-foreground">4. Vérifie avec le quiz en bas de page, puis reviens dans quelques jours pour une réécoute sans texte.</li>
    </ol>

    {step !== null && step > 0 && <div className="space-y-4">
      <div>
        <h3 className="m-0 mb-2 text-base font-semibold">Expressions à reconnaître</h3>
        <ul className="m-0 grid list-none gap-2 p-0">
          {guide.expressions.map((e) => <li key={`${e.segmentId}:${e.text}`} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <p lang="en" className="m-0 font-reading text-[1.05rem] font-semibold">{e.text}</p>
              <Button variant="ghost" size="icon" aria-label={`Écouter « ${e.text} »`} onClick={() => onPlay(segmentStart(e.segmentId) / 1000)}>
                <Play className="size-4" />
              </Button>
            </div>
            {e.meaning && <p className="m-0 text-sm">{e.meaning}</p>}
            <p className="m-0 mt-1 text-sm text-muted-foreground">{e.note}</p>
          </li>)}
        </ul>
      </div>
      {guide.listening.length > 0 && <div>
        <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-semibold"><Ear className="size-4" />À écouter</h3>
        <ul className="m-0 grid list-none gap-2 p-0">
          {guide.listening.map((n) => <li key={`${n.segmentId}:${n.text}`} className={cn('flex items-start justify-between gap-2 rounded-xl bg-muted/50 p-3')}>
            <div><p lang="en" className="m-0 font-reading font-semibold">{n.text}</p><p className="m-0 text-sm text-muted-foreground">{n.note}</p></div>
            <Button variant="ghost" size="icon" aria-label={`Écouter « ${n.text} »`} onClick={() => onPlay(segmentStart(n.segmentId) / 1000)}>
              <Play className="size-4" />
            </Button>
          </li>)}
        </ul>
      </div>}
    </div>}
  </section>;
}
