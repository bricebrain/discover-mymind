import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { Alert, Avatar, Box, Button, CircularProgress, IconButton, Stack, Tab, Tabs, Tooltip, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { CATEGORY_LABELS, formatDuration, formatWhen, useEpisode, useSetEpisodeState } from '../api/episodes';
import { categoryColor, fonts } from '../app/theme';
import { formatClock } from '../player/MiniPlayer';
import { usePlayer } from '../player/PlayerProvider';
import { useNewNote } from '../pages/MindPage';
import { TranscriptView } from '../transcript/TranscriptView';
import { PlayingBars, trackOf } from './EpisodeCard';

/** Détail d'un épisode : en-tête sur la pochette floutée, écoute, transcription ou présentation. */
export function EpisodeDetail({ id, onBack }: { id: string; onBack?: () => void }) {
  const theme = useTheme();
  const { data: episode, isPending, isError } = useEpisode(id);
  const setState = useSetEpisodeState();
  const player = usePlayer();
  const [tab, setTab] = useState<'transcript' | 'about'>('transcript');
  const newNote = useNewNote();

  // Ouvrir un épisode le marque comme vu.
  useEffect(() => {
    if (episode?.state === 'new') setState.mutate({ id: episode.id, state: 'seen' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, episode?.state]);

  if (isPending) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>;
  if (isError || !episode) return <Alert severity="warning" sx={{ m: 2 }}>Épisode introuvable.</Alert>;

  const saved = episode.state === 'saved';
  const isCurrent = player.track?.targetType === 'episode' && player.track.targetId === episode.id;
  const resumeAt = !isCurrent && episode.progressMs && episode.progressCompleted !== 1 && episode.progressMs > 5000 ? episode.progressMs / 1000 : null;
  const listen = () => (isCurrent ? player.toggle() : player.play(trackOf(episode)));
  const color = categoryColor(episode.category, theme.palette.mode);
  const pct = isCurrent && player.duration > 0 ? (player.position / player.duration) * 100
    : resumeAt && episode.progressDurationMs ? (episode.progressMs! / episode.progressDurationMs) * 100 : 0;

  return (
    <Box sx={{ pb: 4, animation: 'riseIn .25s ease-out' }}>
      {/* En-tête : pochette floutée en fond, fondue dans la page */}
      <Box sx={{ position: 'relative', overflow: 'hidden', px: 2, pt: onBack ? 1 : 3, pb: 2.5 }}>
        {episode.imageUrl && (
          <Box aria-hidden sx={{
            position: 'absolute', inset: -60, backgroundImage: `url("${episode.imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(60px) saturate(1.4)', opacity: theme.palette.mode === 'light' ? 0.35 : 0.28,
            maskImage: 'linear-gradient(to bottom, black 40%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent)',
          }} />
        )}
        <Box sx={{ position: 'relative', maxWidth: 720, mx: 'auto' }}>
          {onBack && (
            <IconButton onClick={onBack} aria-label="Retour à la liste" edge="start" sx={{ mb: 1 }}><ArrowBackIcon /></IconButton>
          )}
          <Stack direction="row" spacing={2} alignItems="flex-end" sx={{ mb: 2 }}>
            <Avatar variant="rounded" src={episode.imageUrl ?? undefined} alt="" sx={{
              width: 112, height: 112, borderRadius: 4, boxShadow: '0 14px 34px rgba(0,0,0,0.22)', bgcolor: alpha(color, 0.2),
            }} />
            <Box sx={{ minWidth: 0, pb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>{episode.showTitle}</Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, color: 'text.secondary', flexWrap: 'wrap', rowGap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{CATEGORY_LABELS[episode.category]}</Typography>
                <Typography variant="caption">· {episode.language === 'fr' ? 'Français' : 'Anglais'}</Typography>
                <Typography variant="caption">· {[formatWhen(episode.publishedAt), formatDuration(episode.durationSec)].filter(Boolean).join(' · ')}</Typography>
              </Stack>
            </Box>
          </Stack>

          <Typography component="h1" sx={{ fontFamily: fonts.display, fontSize: { xs: '1.55rem', sm: '1.8rem' }, fontWeight: 600, lineHeight: 1.18, letterSpacing: '-0.015em', mb: 2.5 }}>
            {episode.title}
          </Typography>

          {episode.contentId && <Button component={Link} to={`/library/${episode.contentId}`} variant="outlined" sx={{ mb: 2 }}>Versions préparées</Button>}
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" size="large" onClick={listen}
              startIcon={isCurrent && player.playing ? <PauseIcon /> : <PlayArrowIcon />}
              sx={{ px: 3, position: 'relative', overflow: 'hidden' }}>
              {isCurrent ? (player.playing ? 'Pause' : 'Reprendre') : resumeAt ? `Reprendre à ${formatClock(resumeAt)}` : 'Écouter'}
              {pct > 0 && <Box aria-hidden sx={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${pct}%`, bgcolor: 'secondary.main' }} />}
            </Button>
            {isCurrent && player.playing && <PlayingBars active />}
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Réfléchir : écrire une note liée à cet épisode">
              <IconButton aria-label="Réfléchir : écrire une note liée à cet épisode" sx={{ border: 1, borderColor: 'divider' }}
                onClick={() => void newNote([{ targetType: 'episode', targetId: episode.id, targetTitle: `${episode.title} — ${episode.showTitle}` }])}>
                <EditNoteIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={saved ? 'Retirer de la bibliothèque' : 'Sauvegarder'}>
              <IconButton onClick={() => setState.mutate({ id: episode.id, state: saved ? 'seen' : 'saved' })} disabled={setState.isPending}
                aria-label={saved ? 'Retirer de la bibliothèque' : 'Sauvegarder'} color={saved ? 'primary' : 'default'}
                sx={{ border: 1, borderColor: 'divider' }}>
                {saved ? <BookmarkIcon /> : <BookmarkBorderIcon />}
              </IconButton>
            </Tooltip>
            {!saved && (
              <Tooltip title="Écarter de l’Explorer">
                <IconButton aria-label="Écarter de l’Explorer" sx={{ border: 1, borderColor: 'divider' }}
                  onClick={() => { setState.mutate({ id: episode.id, state: 'dismissed' }); onBack?.(); }}>
                  <VisibilityOffOutlinedIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Box>

      <Box sx={{ px: 2, maxWidth: 720, mx: 'auto' }}>
        {episode.transcriptType && (
          <Tabs value={tab} onChange={(_e, v: 'transcript' | 'about') => setTab(v)} sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="transcript" label="Transcription" />
            <Tab value="about" label="À propos" />
          </Tabs>
        )}
        {episode.transcriptType && tab === 'transcript' ? (
          <TranscriptView episode={episode} onPlay={listen} />
        ) : episode.description ? (
          <Typography sx={{ fontFamily: fonts.reading, fontSize: '1.08rem', lineHeight: 1.75, whiteSpace: 'pre-line', color: 'text.primary' }}>
            {episode.description}
          </Typography>
        ) : (
          <Typography color="text.secondary">Pas de présentation pour cet épisode.</Typography>
        )}
      </Box>
    </Box>
  );
}
