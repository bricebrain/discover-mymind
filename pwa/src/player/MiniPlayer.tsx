import CloseIcon from '@mui/icons-material/Close';
import Forward10Icon from '@mui/icons-material/Forward10';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Replay10Icon from '@mui/icons-material/Replay10';
import {
  Alert, Avatar, Box, ButtonBase, Chip, CircularProgress, Drawer, IconButton, LinearProgress, Slider, Stack, Typography,
} from '@mui/material';
import { useState } from 'react';
import { SKIP_SECONDS, SPEEDS, usePlayer } from './PlayerProvider';

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function PlayPause({ size = 'medium' }: { size?: 'medium' | 'large' }) {
  const { playing, buffering, toggle } = usePlayer();
  const big = size === 'large';
  return (
    <IconButton onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'} color="primary"
      sx={big ? { width: 72, height: 72, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } } : undefined}>
      {buffering && playing ? <CircularProgress size={big ? 32 : 22} color="inherit" />
        : playing ? <PauseIcon fontSize={big ? 'large' : 'medium'} /> : <PlayArrowIcon fontSize={big ? 'large' : 'medium'} />}
    </IconButton>
  );
}

/** Mini-lecteur persistant au-dessus de la navigation ; un toucher ouvre le lecteur complet. */
export function MiniPlayer() {
  const { track, position, duration, error, stop } = usePlayer();
  const [open, setOpen] = useState(false);
  if (!track) return null;
  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <>
      <Box sx={{ position: 'relative', height: 64, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
        <LinearProgress variant="determinate" value={progress} sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }} />
        <Stack direction="row" alignItems="center" sx={{ height: '100%', pl: 1, pr: 0.5 }}>
          <ButtonBase onClick={() => setOpen(true)} aria-label="Ouvrir le lecteur"
            sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1.25, height: '100%', borderRadius: 2, textAlign: 'left' }}>
            <Avatar variant="rounded" src={track.imageUrl ?? undefined} alt="" sx={{ width: 44, height: 44, borderRadius: 1.5 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{track.title}</Typography>
              <Typography variant="caption" color={error ? 'error' : 'text.secondary'} noWrap component="div">
                {error ?? `${track.subtitle} · ${formatClock(position)} / ${formatClock(duration)}`}
              </Typography>
            </Box>
          </ButtonBase>
          <PlayPause />
          <IconButton onClick={stop} aria-label="Fermer le lecteur" size="small"><CloseIcon fontSize="small" /></IconButton>
        </Stack>
      </Box>
      <FullPlayer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Lecteur complet : pochette, barre de progression, sauts de 10 s, vitesse. */
function FullPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { track, position, duration, rate, error, seek, skip, setRate } = usePlayer();
  const [scrub, setScrub] = useState<number | null>(null);
  if (!track) return null;

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxWidth: 640, mx: 'auto', pb: 'env(safe-area-inset-bottom)' } }}>
      <Box sx={{ p: 2, pt: 1 }}>
        <Box sx={{ textAlign: 'center' }}>
          <IconButton onClick={onClose} aria-label="Réduire le lecteur"><KeyboardArrowDownIcon /></IconButton>
        </Box>
        <Stack alignItems="center" spacing={2} sx={{ px: 1 }}>
          <Avatar variant="rounded" src={track.imageUrl ?? undefined} alt="" sx={{ width: 'min(60vw, 240px)', height: 'min(60vw, 240px)', borderRadius: 4 }} />
          <Box sx={{ textAlign: 'center', width: '100%' }}>
            <Typography variant="h3" component="h2" sx={{ mb: 0.5 }}>{track.title}</Typography>
            <Typography color="text.secondary" variant="body2">{track.subtitle}</Typography>
          </Box>
          {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}
          <Box sx={{ width: '100%' }}>
            <Slider
              aria-label="Position"
              min={0} max={Math.max(duration, 1)} step={1}
              value={scrub ?? position}
              onChange={(_e, v) => setScrub(v as number)}
              onChangeCommitted={(_e, v) => { seek(v as number); setScrub(null); }}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ mt: -1 }}>
              <Typography variant="caption" color="text.secondary">{formatClock(scrub ?? position)}</Typography>
              <Typography variant="caption" color="text.secondary">-{formatClock(Math.max(duration - (scrub ?? position), 0))}</Typography>
            </Stack>
          </Box>
          <Stack direction="row" alignItems="center" spacing={3}>
            <IconButton onClick={() => skip(-SKIP_SECONDS)} aria-label={`Reculer de ${SKIP_SECONDS} secondes`}><Replay10Icon fontSize="large" /></IconButton>
            <PlayPause size="large" />
            <IconButton onClick={() => skip(SKIP_SECONDS)} aria-label={`Avancer de ${SKIP_SECONDS} secondes`}><Forward10Icon fontSize="large" /></IconButton>
          </Stack>
          <Stack direction="row" spacing={0.75} role="radiogroup" aria-label="Vitesse de lecture">
            {SPEEDS.map((s) => (
              <Chip key={s} label={`${String(s).replace('.', ',')}×`} role="radio" aria-checked={rate === s}
                color={rate === s ? 'primary' : 'default'} variant={rate === s ? 'filled' : 'outlined'} onClick={() => setRate(s)} />
            ))}
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
}
