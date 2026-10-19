import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Episode } from '../api/episodes';
import { Button } from '@/components/ui/button';
import { Notice, Spinner, Switch } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { formatClock } from '../player/MiniPlayer';
import { usePlayer } from '../player/PlayerProvider';
import { activeSegment, isSynced, parseTranscript } from './subtitles';

/** Libellé court d'un intervenant : « Speaker 2 » → « Voix 2 ». */
const speakerLabel = (s: string | null) => (s ? s.replace(/^(Speaker|Intervenant|Locuteur)\s*/i, 'Voix ') : null);

/** Une couleur stable par intervenant, pour suivre qui parle d'un coup d'œil. */
const SPEAKER_HUES = [172, 28, 262, 205, 340, 95];
function speakerColor(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${SPEAKER_HUES[h % SPEAKER_HUES.length]} 50% 36%)`;
}

/**
 * Transcription fournie par le flux, synchronisée avec l'audio officiel quand c'est vérifié (§ 7.3) :
 * segment en cours surligné, toucher un segment pour y aller.
 */
export function TranscriptView({ episode, onPlay }: { episode: Episode; onPlay: () => void }) {
  const player = usePlayer();
  const transcript = useQuery({
    queryKey: ['transcript', episode.id],
    queryFn: () => api<{ type: 'srt' | 'vtt'; text: string; audioRef: string }>(`/api/episodes/${episode.id}/transcript`),
    staleTime: Infinity,
  });
  const segments = useMemo(() => (transcript.data ? parseTranscript(transcript.data.text) : []), [transcript.data]);
  const [follow, setFollow] = useState(true);
  /** Calage manuel : décalage (ms) entre l'audio diffusé et le fichier transcrit, ou mode « toucher la phrase entendue ». */
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const isCurrent = player.track?.targetType === 'episode' && player.track.targetId === episode.id;
  // La durée réelle n'est connue qu'une fois l'audio chargé ; avant, on ne surligne pas.
  const exact = isCurrent && isSynced(player.mediaDuration, episode.durationSec);
  const calibrated = isCurrent && !exact && offsetMs !== null;
  const synced = exact || calibrated;
  const shift = calibrated ? offsetMs! : 0;
  const active = synced ? activeSegment(segments, player.position * 1000 - shift) : -1;

  useEffect(() => {
    if (follow && player.playing && active >= 0) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, follow, player.playing]);

  if (transcript.isPending) return <div className="grid place-items-center py-6"><Spinner /></div>;
  if (transcript.isError) return <Notice tone="warning">{transcript.error.message}</Notice>;
  if (segments.length === 0) return <Notice>Transcription vide ou illisible.</Notice>;

  const goTo = (startMs: number) => {
    if (!isCurrent) return onPlay();
    if (calibrating) {
      // La phrase touchée est celle qu'on entend maintenant : on en déduit le décalage.
      setOffsetMs(Math.round(player.position * 1000 - startMs));
      setCalibrating(false);
      return;
    }
    if (synced) player.seek((startMs + shift) / 1000);
  };

  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-y-1">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Transcription fournie par l’émission</p>
      {synced && <label className="flex min-h-11 items-center gap-2 text-xs font-medium">
        <Switch checked={follow} onChange={setFollow} label="Suivre la lecture" />Suivre la lecture
      </label>}
    </div>
    {isCurrent && player.mediaDuration > 0 && !exact && <div className={cn('mb-3 rounded-xl border px-3 py-2.5 text-sm leading-snug',
      calibrating ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>
      <p className="m-0">{calibrating ? 'Touche la phrase que tu entends en ce moment.'
        : calibrated ? `Texte calé à la main (décalage ${offsetMs! >= 0 ? '+' : '−'}${formatClock(Math.abs(offsetMs!) / 1000)}). Recale-le si une publicité le fait dériver.`
        : `Texte non synchronisé : l’audio diffusé dure ${formatClock(player.mediaDuration)}, celui qui a été transcrit ${formatClock(episode.durationSec ?? 0)} (publicités insérées).`}</p>
      <Button size="sm" variant={calibrating ? 'ghost' : 'outline'} className="mt-2" onClick={() => setCalibrating((c) => !c)}>
        {calibrating ? 'Annuler' : calibrated ? 'Recaler' : 'Caler le texte'}
      </Button>
    </div>}
    <div className="flex flex-col gap-0.5">
      {segments.map((s, i) => {
        const on = i === active;
        const label = speakerLabel(s.speaker);
        const showLabel = label && (i === 0 || segments[i - 1]!.speaker !== s.speaker);
        const dim = synced && follow && player.playing && !on;
        return <button key={s.id} type="button" ref={on ? activeRef : undefined} onClick={() => goTo(s.startMs)} aria-current={on ? 'true' : undefined}
          className={cn('relative block w-full rounded-xl py-2 pl-4 pr-2.5 text-left transition-colors duration-300',
            'before:absolute before:bottom-2.5 before:left-1 before:top-2.5 before:w-[3px] before:rounded-full before:transition-colors',
            on ? 'bg-article-soft before:bg-article' : calibrating ? 'bg-zinc-50 hover:bg-muted before:bg-transparent' : 'hover:bg-muted before:bg-transparent')}>
          {showLabel && <span className="mb-0.5 block text-xs font-bold tracking-wide" style={{ color: speakerColor(s.speaker!) }}>{label}</span>}
          <span className={cn('font-reading text-[1.08rem] leading-[1.72] transition-colors duration-300', dim ? 'text-muted-foreground' : 'text-foreground')}>{s.text}</span>
          {synced && <span className="ml-2 text-xs tabular-nums text-zinc-400">{formatClock((s.startMs + shift) / 1000)}</span>}
        </button>;
      })}
    </div>
  </div>;
}
