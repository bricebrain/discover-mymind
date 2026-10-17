import { Alert, Box, Button, ButtonBase, CircularProgress, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { fonts } from '../app/theme';
import { formatClock } from '../player/MiniPlayer';
import { useVariantTranscript } from './useVariantTranscript';

export function VariantTranscript({ detail, variant, activePositionMs, verified, playing, onSeek }: {
  detail: ContentDetail; variant: ContentVariant; activePositionMs: number | null;
  verified: boolean; playing: boolean; onSeek: (positionSec: number) => void;
}) {
  const reading = useVariantTranscript(detail, variant, activePositionMs, playing);
  const { segments, translated } = reading;
  if (segments.isPending) return <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} aria-label="Chargement de la transcription" /></Box>;
  if (segments.isError) return <Alert severity="warning" action={<Button onClick={() => void segments.refetch()}>Réessayer</Button>}>{segments.error.message}</Alert>;
  if (!segments.data.segments.length) return <Alert severity="info">Aucun texte disponible pour cette version.</Alert>;

  return <Box sx={{ mt: 3 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
      <Typography component="h2" variant="h5">Transcription</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {reading.canShowFrench && <FormControlLabel control={<Switch checked={reading.showFrench} onChange={(_e, checked) => reading.setShowFrench(checked)} />} label="Afficher le français" />}
        {verified && <FormControlLabel control={<Switch checked={reading.follow} onChange={(_e, checked) => reading.setFollow(checked)} />} label="Suivre la lecture" />}
      </Stack>
    </Stack>
    {variant.language.split('-')[0] !== 'fr' && !reading.canShowFrench && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Français non disponible pour cette version.</Typography>}
    {reading.showFrench && translated.isFetching && <Typography role="status" variant="body2">Chargement du français…</Typography>}
    {reading.showFrench && translated.isError && <Alert severity="warning" action={<Button onClick={() => void translated.refetch()}>Réessayer</Button>}>La traduction française n’a pas pu être chargée.</Alert>}
    <Stack spacing={1}>
      {segments.data.segments.map((s, index) => {
        const active = index === reading.active;
        const navigable = verified && !!variant.audio && s.startMs !== null;
        const text = <>
          {(s.speaker || s.startMs !== null) && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mb: .5 }}>
            {s.speaker}{s.speaker && s.startMs !== null ? ' · ' : ''}{s.startMs !== null ? formatClock(s.startMs / 1000) : ''}
          </Typography>}
          <Typography component="span" lang={variant.language} sx={{ fontFamily: fonts.reading, fontSize: '1.08rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{s.text}</Typography>
        </>;
        return <Box key={s.id} ref={active ? reading.activeRef : undefined} aria-current={active ? 'true' : undefined}
          sx={(t) => ({ p: 1.5, borderRadius: 3, scrollMarginBlock: '100px', bgcolor: active ? alpha(t.palette.primary.main, .09) : 'transparent',
            borderLeft: '3px solid', borderColor: active ? 'primary.main' : 'transparent' })}>
          {navigable ? <ButtonBase onClick={() => onSeek(s.startMs! / 1000)} title={`Écouter depuis ${formatClock(s.startMs! / 1000)}`}
            sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 1 }}>{text}</ButtonBase> : <Box>{text}</Box>}
          {reading.showFrench && <Typography lang="fr" sx={{ mt: 1, color: 'text.secondary', fontFamily: fonts.reading, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {reading.french.get(s.id) ?? (translated.isFetching ? '…' : 'Traduction non disponible pour ce passage.')}
          </Typography>}
        </Box>;
      })}
    </Stack>
  </Box>;
}
