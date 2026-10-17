import { Alert, Box, Button, ButtonBase, CircularProgress, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Episode } from '../api/episodes';
import { readingFont } from '../app/theme';
import { formatClock } from '../player/MiniPlayer';
import { usePlayer } from '../player/PlayerProvider';
import { activeSegment, isSynced, parseTranscript } from './subtitles';

/** Libellé court d'un intervenant : « Speaker 2 » → « Voix 2 ». */
const speakerLabel = (s: string | null) => (s ? s.replace(/^(Speaker|Intervenant|Locuteur)\s*/i, 'Voix ') : null);

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

  if (transcript.isPending) return <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>;
  if (transcript.isError) return <Alert severity="warning">{transcript.error.message}</Alert>;
  if (segments.length === 0) return <Alert severity="info">Transcription vide ou illisible.</Alert>;

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

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="overline" color="text.secondary">Transcription fournie par l’émission</Typography>
        {synced && (
          <FormControlLabel control={<Switch size="small" checked={follow} onChange={(e) => setFollow(e.target.checked)} />}
            label={<Typography variant="caption">Suivre la lecture</Typography>} />
        )}
      </Stack>
      {isCurrent && player.mediaDuration > 0 && !exact && (
        <Alert severity={calibrating ? 'warning' : 'info'} sx={{ mb: 1.5 }}
          action={<Button color="inherit" size="small" onClick={() => setCalibrating((c) => !c)}>
            {calibrating ? 'Annuler' : calibrated ? 'Recaler' : 'Caler le texte'}
          </Button>}>
          {calibrating ? 'Touche la phrase que tu entends en ce moment.'
            : calibrated ? `Texte calé à la main (décalage ${offsetMs! >= 0 ? '+' : '−'}${formatClock(Math.abs(offsetMs!) / 1000)}). Recale-le si une publicité le fait dériver.`
            : <>
          Texte non synchronisé : l’audio diffusé dure {formatClock(player.mediaDuration)}, celui qui a été transcrit {formatClock(episode.durationSec ?? 0)} (publicités insérées).
            </>}
        </Alert>
      )}
      <Stack spacing={0.5}>
        {segments.map((s, i) => {
          const on = i === active;
          const label = speakerLabel(s.speaker);
          const showLabel = label && (i === 0 || segments[i - 1]!.speaker !== s.speaker);
          return (
            <ButtonBase key={s.id} ref={on ? activeRef : undefined} onClick={() => goTo(s.startMs)}
              aria-current={on ? 'true' : undefined}
              sx={{
                display: 'block', textAlign: 'left', borderRadius: 2, px: 1.25, py: 0.75, width: '100%',
                bgcolor: on ? 'action.selected' : 'transparent', transition: 'background-color .25s',
              }}>
              {showLabel && (
                <Typography variant="caption" color="primary" sx={{ fontWeight: 650, display: 'block' }}>{label}</Typography>
              )}
              <Typography component="span" sx={{ fontFamily: readingFont, fontSize: '1.05rem', lineHeight: 1.65, color: on ? 'text.primary' : 'text.secondary' }}>
                {s.text}
              </Typography>
              {synced && <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>{formatClock((s.startMs + shift) / 1000)}</Typography>}
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
}
