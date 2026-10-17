import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Alert, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import type { ContentVariant } from '../api/contents';
import { formatClock } from '../player/MiniPlayer';
import type { useContentReader } from './useContentReader';
import { variantLabel } from './variants';

type Reader = ReturnType<typeof useContentReader>;
export function VariantSelector({ variants, selected, onSelect }: { variants: ContentVariant[]; selected: ContentVariant; onSelect: (key: string) => void }) {
  return <FormControl fullWidth sx={{ my: 2 }}>
    <InputLabel id="version-label">Version</InputLabel>
    <Select labelId="version-label" label="Version" value={selected.key} onChange={(e) => onSelect(e.target.value)}
      renderValue={() => <Typography sx={{ whiteSpace: 'normal' }}>{variantLabel(selected)}</Typography>}>
      {variants.map((v) => <MenuItem key={v.key} value={v.key} sx={{ whiteSpace: 'normal' }}>{variantLabel(v)}</MenuItem>)}
    </Select>
  </FormControl>;
}
export function PlaybackControls({ reader }: { reader: Reader }) {
  const { variant, progress } = reader;
  if (!variant?.audio) return <Alert severity="info">Cette version est disponible en texte seul.</Alert>;
  return <Stack spacing={1}>
    <Stack direction="row" alignItems="center" spacing={2} useFlexGap flexWrap="wrap">
      <Button variant="contained" startIcon={reader.buffering ? <CircularProgress size={18} color="inherit" /> : reader.playing ? <PauseIcon /> : <PlayArrowIcon />}
        onClick={() => reader.play()}>{reader.playing ? 'Pause' : reader.positionSec >= 5 ? `Reprendre à ${formatClock(reader.positionSec)}` : 'Écouter cette version'}</Button>
      {!reader.playing && reader.positionSec < 5 && progress.data?.completed && <Typography variant="body2" color="text.secondary">Version terminée · relancer depuis le début</Typography>}
      {variant.style === 'dialogue' && <Typography variant="body2" color="text.secondary">Dialogue</Typography>}
    </Stack>
    {progress.isError && <Alert severity="warning" action={<Button onClick={() => void progress.refetch()}>Réessayer</Button>}>La progression enregistrée n’a pas pu être chargée.</Alert>}
    {variant.audio.timingSource === 'none' ? <Typography variant="body2" color="text.secondary">Transcription disponible sans synchronisation audio.</Typography>
      : !reader.verified && <Typography variant="body2" color="text.secondary">{reader.current
        ? 'La synchronisation n’est pas confirmée pour cet audio. Le texte reste disponible sans surlignage.'
        : 'Lancez l’audio pour vérifier la synchronisation du texte.'}</Typography>}
  </Stack>;
}
