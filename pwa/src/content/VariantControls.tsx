import { Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/kit';
import { formatClock } from '../player/MiniPlayer';
import type { useContentReader } from './useContentReader';

type Reader = ReturnType<typeof useContentReader>;

export function PlaybackControls({ reader }: { reader: Reader }) {
  const { variant, progress } = reader;
  if (!variant?.audio) return <Notice>Cette version est disponible en texte seul.</Notice>;
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => reader.play()} className="h-12 px-6 text-[15px]">
        {reader.buffering ? <Loader2 className="size-5 animate-spin" /> : reader.playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
        {reader.playing ? 'Pause' : reader.positionSec >= 5 ? `Reprendre à ${formatClock(reader.positionSec)}` : 'Écouter cette version'}
      </Button>
      {!reader.playing && reader.positionSec < 5 && progress.data?.completed && <span className="text-sm text-muted-foreground">Version terminée · relancer depuis le début</span>}
      {variant.style === 'dialogue' && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Dialogue</span>}
    </div>
    {progress.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void progress.refetch()}>Réessayer</Button>}>La progression enregistrée n’a pas pu être chargée.</Notice>}
    {variant.audio.timingSource === 'none' ? <p className="m-0 text-sm text-muted-foreground">Transcription disponible sans synchronisation audio.</p>
      : !reader.verified && <p className="m-0 text-sm text-muted-foreground">{reader.current
        ? 'La synchronisation n’est pas confirmée pour cet audio. Le texte reste disponible sans surlignage.'
        : 'Lancez l’audio pour vérifier la synchronisation du texte.'}</p>}
  </div>;
}
