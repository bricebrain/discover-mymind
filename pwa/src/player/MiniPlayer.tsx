import CloseIcon from '@mui/icons-material/Close';
import Forward10Icon from '@mui/icons-material/Forward10';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Replay10Icon from '@mui/icons-material/Replay10';
import { Alert, Avatar, Box, ButtonBase, CircularProgress, Drawer, IconButton, Slider, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';
import { fonts } from '../app/theme';
import { SKIP_SECONDS, SPEEDS, usePlayer } from './PlayerProvider';

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Hauteur réservée par le mini-lecteur (carte de 64 px + marge), lue par les mises en page via --player-h. */
export const MINI_PLAYER_SPACE = 72;

function PlayPause({ size = 'medium' }: { size?: 'medium' | 'large' }) {
  const { playing, buffering, toggle } = usePlayer();
  const big = size === 'large';
  return (
    <IconButton onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'}
      sx={{
        width: big ? 76 : 44, height: big ? 76 : 44, bgcolor: 'primary.main', color: 'primary.contrastText',
        boxShadow: big ? (t) => `0 10px 30px ${alpha(t.palette.primary.main, 0.35)}` : 'none',
        '&:hover': { bgcolor: 'primary.main', filter: 'brightness(1.08)' }, transition: 'transform .15s', '&:active': { transform: 'scale(.94)' },
      }}>
      {buffering && playing ? <CircularProgress size={big ? 30 : 20} color="inherit" />
        : playing ? <PauseIcon fontSize={big ? 'large' : 'small'} /> : <PlayArrowIcon fontSize={big ? 'large' : 'small'} />}
    </IconButton>
  );
}

/** Mini-lecteur persistant : carte flottante au-dessus de la navigation ; un toucher ouvre le lecteur complet. */
export function MiniPlayer() {
  const { track, position, duration, error, stop } = usePlayer();
  const [open, setOpen] = useState(false);
  if (!track) return null;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <>
      <Box sx={{ px: 1, pt: 1, maxWidth: 760, mx: 'auto' }}>
        <Box sx={(t) => ({
          position: 'relative', height: 64, borderRadius: 4, overflow: 'hidden', bgcolor: t.palette.mode === 'light' ? '#FFFFFF' : '#2A2620',
          boxShadow: t.palette.mode === 'light' ? '0 6px 24px rgba(30,27,22,0.12), 0 1px 3px rgba(30,27,22,0.08)' : '0 6px 24px rgba(0,0,0,0.45)',
          animation: 'riseIn .25s ease-out',
        })}>
          <Stack direction="row" alignItems="center" sx={{ height: '100%', pl: 1, pr: 0.5, gap: 0.5 }}>
            <ButtonBase onClick={() => setOpen(true)} aria-label="Ouvrir le lecteur"
              sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1.25, height: '100%', borderRadius: 3, textAlign: 'left' }}>
              <Avatar variant="rounded" src={track.imageUrl ?? undefined} alt="" sx={{ width: 46, height: 46, borderRadius: 2.5 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>{track.title}</Typography>
                <Typography variant="caption" color={error ? 'error' : 'text.secondary'} noWrap component="div">
                  {error ?? `${track.subtitle} · ${formatClock(position)} / ${formatClock(duration)}`}
                </Typography>
              </Box>
            </ButtonBase>
            <PlayPause />
            <IconButton onClick={stop} aria-label="Fermer le lecteur" size="small" sx={{ color: 'text.secondary' }}><CloseIcon fontSize="small" /></IconButton>
          </Stack>
          <Box aria-hidden sx={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${progress}%`, bgcolor: 'secondary.main', transition: 'width .3s linear' }} />
        </Box>
      </Box>
      <FullPlayer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Lecteur complet : pochette sur fond flouté, barre de progression, sauts de 10 s, vitesse. */
function FullPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { track, position, duration, rate, error, seek, skip, setRate } = usePlayer();
  const [scrub, setScrub] = useState<number | null>(null);
  if (!track) return null;
  const shown = scrub ?? position;

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxWidth: 640, mx: 'auto', overflow: 'hidden', pb: 'env(safe-area-inset-bottom)' } }}>
      {/* Fond : la pochette floutée, très atténuée */}
      {track.imageUrl && (
        <Box aria-hidden sx={{
          position: 'absolute', inset: -40, backgroundImage: `url("${track.imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(48px) saturate(1.3)', opacity: (t) => (t.palette.mode === 'light' ? 0.35 : 0.3), pointerEvents: 'none',
        }} />
      )}
      <Box sx={{ position: 'relative', p: 2.5, pt: 1 }}>
        <Box sx={{ textAlign: 'center' }}>
          <IconButton onClick={onClose} aria-label="Réduire le lecteur"><KeyboardArrowDownIcon /></IconButton>
        </Box>
        <Stack alignItems="center" spacing={2.5}>
          <Avatar variant="rounded" src={track.imageUrl ?? undefined} alt="" sx={{
            width: 'min(64vw, 260px)', height: 'min(64vw, 260px)', borderRadius: 5, boxShadow: '0 20px 50px rgba(0,0,0,0.28)',
          }} />
          <Box sx={{ textAlign: 'center', width: '100%' }}>
            <Typography sx={{ fontFamily: fonts.display, fontSize: '1.35rem', fontWeight: 600, lineHeight: 1.25, mb: 0.5 }}>{track.title}</Typography>
            <Typography color="text.secondary" variant="body2">{track.subtitle}</Typography>
          </Box>
          {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}
          <Box sx={{ width: '100%' }}>
            <Slider
              aria-label="Position"
              min={0} max={Math.max(duration, 1)} step={1}
              value={shown}
              onChange={(_e, v) => setScrub(v as number)}
              onChangeCommitted={(_e, v) => { seek(v as number); setScrub(null); }}
              sx={{ height: 5 }}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ mt: -1, fontVariantNumeric: 'tabular-nums' }}>
              <Typography variant="caption" color="text.secondary">{formatClock(shown)}</Typography>
              <Typography variant="caption" color="text.secondary">−{formatClock(Math.max(duration - shown, 0))}</Typography>
            </Stack>
          </Box>
          <Stack direction="row" alignItems="center" spacing={4}>
            <IconButton onClick={() => skip(-SKIP_SECONDS)} aria-label={`Reculer de ${SKIP_SECONDS} secondes`}><Replay10Icon sx={{ fontSize: 34 }} /></IconButton>
            <PlayPause size="large" />
            <IconButton onClick={() => skip(SKIP_SECONDS)} aria-label={`Avancer de ${SKIP_SECONDS} secondes`}><Forward10Icon sx={{ fontSize: 34 }} /></IconButton>
          </Stack>
          <Box role="radiogroup" aria-label="Vitesse de lecture" sx={(t) => ({
            display: 'flex', p: 0.5, borderRadius: 999, bgcolor: alpha(t.palette.text.primary, 0.06),
          })}>
            {SPEEDS.map((s) => {
              const on = rate === s;
              return (
                <ButtonBase key={s} role="radio" aria-checked={on} onClick={() => setRate(s)} sx={{
                  px: 1.5, height: 34, borderRadius: 999, fontWeight: 650, fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums',
                  bgcolor: on ? 'background.paper' : 'transparent', color: on ? 'text.primary' : 'text.secondary',
                  boxShadow: on ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', transition: 'background-color .2s',
                }}>
                  {`${String(s).replace('.', ',')}×`}
                </ButtonBase>
              );
            })}
          </Box>
        </Stack>
      </Box>
    </Drawer>
  );
}
