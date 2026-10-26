import { Alert, Box, Button as MuiButton, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Check, Ear, EyeOff, Headphones, Keyboard, Play, ScrollText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useContentSegments, type ContentDetail, type ContentGuide, type ContentSegment, type ContentVariant, type GuideNote } from '../api/contents';
import { usePlayer } from '../player/PlayerProvider';
import { formatClock } from '../player/MiniPlayer';
import { PICKS_KEY, saveWordPick } from '../vocabulary/api';
import { validWordPick } from '../vocabulary/validation';
import { useReviewPlayback } from './useReviewPlayback';
import { Dictation } from './Dictation';

export interface GuidePassage { guide: ContentGuide; startMs: number; endMs: number; segments: ContentSegment[] }

/** Bornes du passage de travail, seulement si le guide renvoie à des passages horodatés de ce document. */
export function guidePassage(guide: ContentGuide | undefined, segments: ContentSegment[]): GuidePassage | null {
  if (!guide) return null;
  const from = segments.findIndex((s) => s.id === guide.passage.fromSegment), to = segments.findIndex((s) => s.id === guide.passage.toSegment);
  const first = segments[from], last = segments[to];
  if (first?.startMs == null || last?.endMs == null || to < from || last.endMs <= first.startMs) return null;
  return { guide, startMs: first.startMs, endMs: last.endMs, segments: segments.slice(from, to + 1) };
}

const STEPS = [
  { title: 'Écouter sans le texte', hint: 'Le sujet général, sans chercher chaque mot.', icon: Headphones, hide: true },
  { title: 'Comprendre', hint: 'Réécoute avec le texte ; le français et les expressions seulement là où ça bloque.', icon: ScrollText, hide: false },
  { title: 'Dictée', hint: 'Tape ce que tu entends, phrase par phrase : tu vois ce qui t’échappe et pourquoi.', icon: Keyboard, hide: true },
  { title: 'Réécouter sans le texte', hint: 'Reconnais-tu maintenant les expressions à l’oreille ?', icon: EyeOff, hide: true },
] as const;
const DICTATION = 2;
const SLOW_RATE = 0.8;

/**
 * Les nouveaux guides annotent tout le texte ; ce panneau conserve les exercices sur un extrait.
 * La lecture s'arrête à la fin de ce qui est demandé (passage ou phrase) ; le texte est masqué pendant les écoutes sans aide.
 */
export function GuidePanel({ detail, variant, playing, positionSec, onPlay, onHideText, initialReview = false }: {
  detail: ContentDetail; variant: ContentVariant; initialReview?: boolean; playing: boolean; positionSec: number;
  onPlay: (positionSec: number) => void; onHideText: (hidden: boolean) => void;
}) {
  const player = usePlayer();
  const queryClient = useQueryClient();
  const segments = useContentSegments(detail.publicationId, variant);
  const [step, setStep] = useState<number | null>(initialReview ? 3 : null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [slow, setSlow] = useState(false);
  const review = useReviewPlayback(detail.content.id, detail.publicationId, variant.key, initialReview && step === 3, playing, positionSec);
  const openedReview = useRef(false);
  const stopAt = useRef<number | null>(null);
  const normalRate = useRef<number | null>(null);
  // Le lecteur change d'identité à chaque mise à jour : le nettoyage de sortie passe par une référence.
  const playerRef = useRef(player);
  playerRef.current = player;
  const passage = segments.data ? guidePassage(segments.data.guide, segments.data.segments) : null;

  useEffect(() => {
    if (!initialReview || !passage || openedReview.current) return;
    openedReview.current = true;
    onHideText(true);
    stopAt.current = passage.endMs;
    review.arm(passage.startMs, passage.endMs);
    onPlay(passage.startMs / 1000);
  }, [initialReview, passage, onHideText, onPlay, review]);

  // Arrêt à la fin de l'écoute demandée ; toute autre lecture reste libre.
  useEffect(() => {
    if (stopAt.current === null || !playing) return;
    if (positionSec * 1000 >= stopAt.current) { stopAt.current = null; player.pause(); }
  }, [playing, positionSec, player]);
  useEffect(() => () => {
    onHideText(false);
    if (normalRate.current !== null) playerRef.current.setRate(normalRate.current);
  }, [onHideText]);

  const keep = useMutation({
    mutationFn: async (notes: GuideNote[]) => {
      for (const note of notes) {
        const index = segments.data!.segments.findIndex((s) => s.id === note.segmentId), sentence = segments.data!.segments[index]?.text ?? '';
        if (index < 0 || !validWordPick(note.text, sentence)) continue;
        await saveWordPick({ word: note.text, sentence, contentId: detail.content.id, publicationId: detail.publicationId,
          variantKey: variant.key, segmentIndex: index, language: 'en' });
        setSaved((all) => new Set(all).add(note.text));
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: PICKS_KEY }),
  });

  if (!passage) return null;
  const { guide } = passage;
  const playRange = (startMs: number, endMs: number) => { stopAt.current = endMs; onPlay(startMs / 1000); };
  /** Une expression ou un point d'écoute : sa phrase seulement. */
  const playSentence = (id: string) => {
    const s = segments.data!.segments.find((x) => x.id === id);
    if (s?.startMs != null && s.endMs != null) playRange(s.startMs, s.endMs);
  };
  const setSlowRate = (value: boolean) => {
    if (value && normalRate.current === null) { normalRate.current = player.rate; player.setRate(SLOW_RATE); }
    if (!value && normalRate.current !== null) { player.setRate(normalRate.current); normalRate.current = null; }
    setSlow(value);
  };
  const start = (index: number) => {
    setStep(index);
    if (index === 3) review.arm(passage.startMs, passage.endMs); else review.cancel();
    onHideText(STEPS[index]!.hide);
    if (index !== DICTATION) playRange(passage.startMs, passage.endMs);
    else player.pause();
  };
  const annotated = guide.annotations !== undefined;
  const unsaved = guide.expressions.filter((e) => !saved.has(e.text));

  return <section aria-label="Original guidé" className={`${cardCls} mt-5 space-y-4 p-4`}>
    {annotated && <Box sx={{ mb: 2 }}>
      <Typography component="h2" variant="h6">Comprendre tout l’audio</Typography>
      <Typography sx={{ mt: 1, mb: 1 }}>Les difficultés sont expliquées en français directement dans la transcription. Le texte anglais reste intégral.</Typography>
      <MuiButton variant="outlined" onClick={() => {
        setStep(null); review.cancel(); stopAt.current = null; setSlowRate(false); onHideText(false); onPlay(0);
      }}>Écouter tout le contenu avec les aides</MuiButton>
      <Typography component="h3" variant="subtitle1" sx={{ mt: 3 }}>Entraînement facultatif sur un extrait</Typography>
      <Typography variant="body2">Les étapes ci-dessous, la dictée et le quiz concernent uniquement cet extrait.</Typography>
    </Box>}
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
      <li className="px-1 text-sm text-muted-foreground">5. Vérifie avec le quiz en bas de page, puis reviens dans quelques jours pour une réécoute sans texte.</li>
    </ol>

    {review.complete.isError && <Notice tone="error">{review.complete.error.message}<Button onClick={() => review.complete.mutate()}>Réessayer l’enregistrement</Button></Notice>}
    {review.complete.isSuccess && <Notice tone="success">Réécoute enregistrée. Le prochain rendez-vous est programmé.</Notice>}

    {step === DICTATION && <Dictation key={variant.key} contentId={detail.content.id} publicationId={detail.publicationId} variantKey={variant.key}
      segments={passage.segments} units={guide.dictation} onPlayRange={playRange} onSlow={setSlowRate} slow={slow} />}

    {annotated && step === 1 && <Alert severity="info">Les explications sont accessibles en touchant les expressions soulignées dans la transcription.</Alert>}
    {step === 1 && !annotated && <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-base font-semibold">Expressions à reconnaître</h3>
          {unsaved.length > 1 && <Button size="sm" variant="outline" disabled={keep.isPending} onClick={() => keep.mutate(unsaved)}>
            <BookmarkPlus className="size-4" />Tout ajouter à ma révision
          </Button>}
        </div>
        <ul className="m-0 grid list-none gap-2 p-0">
          {guide.expressions.map((e) => <li key={`${e.segmentId}:${e.text}`} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <p lang="en" className="m-0 font-reading text-[1.05rem] font-semibold">{e.text}</p>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" aria-label={`Écouter « ${e.text} »`} onClick={() => playSentence(e.segmentId)}>
                  <Play className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={saved.has(e.text) || keep.isPending}
                  aria-label={saved.has(e.text) ? `« ${e.text} » est dans ta révision` : `Ajouter « ${e.text} » à ma révision`} onClick={() => keep.mutate([e])}>
                  {saved.has(e.text) ? <Check className="size-4" /> : <BookmarkPlus className="size-4" />}
                </Button>
              </div>
            </div>
            {e.meaning && <p className="m-0 text-sm">{e.meaning}</p>}
            <p className="m-0 mt-1 text-sm text-muted-foreground">{e.note}</p>
          </li>)}
        </ul>
        {keep.isError && <Notice tone="error" className="mt-2">{keep.error.message}</Notice>}
      </div>
      {guide.listening.length > 0 && <div>
        <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-semibold"><Ear className="size-4" />À écouter</h3>
        <ul className="m-0 grid list-none gap-2 p-0">
          {guide.listening.map((n) => <li key={`${n.segmentId}:${n.text}`} className={cn('flex items-start justify-between gap-2 rounded-xl bg-muted/50 p-3')}>
            <div><p lang="en" className="m-0 font-reading font-semibold">{n.text}</p><p className="m-0 text-sm text-muted-foreground">{n.note}</p></div>
            <Button variant="ghost" size="icon" aria-label={`Écouter « ${n.text} »`} onClick={() => playSentence(n.segmentId)}>
              <Play className="size-4" />
            </Button>
          </li>)}
        </ul>
      </div>}
    </div>}
  </section>;
}
