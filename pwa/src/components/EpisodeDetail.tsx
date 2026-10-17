import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';
import { CATEGORY_LABELS, formatDuration, formatWhen, useEpisode, useSetEpisodeState } from '../api/episodes';
import { readingFont } from '../app/theme';

/** Détail d'un épisode. Le lecteur intégré arrive au lot 3 ; en attendant, l'audio officiel s'ouvre à part. */
export function EpisodeDetail({ id, onBack }: { id: string; onBack?: () => void }) {
  const { data: episode, isPending, isError } = useEpisode(id);
  const setState = useSetEpisodeState();

  // Ouvrir un épisode le marque comme vu.
  useEffect(() => {
    if (episode?.state === 'new') setState.mutate({ id: episode.id, state: 'seen' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, episode?.state]);

  if (isPending) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>;
  if (isError || !episode) return <Alert severity="warning" sx={{ m: 2 }}>Épisode introuvable.</Alert>;

  const saved = episode.state === 'saved';
  return (
    <Box sx={{ p: 2, pb: 4 }}>
      {onBack && (
        <IconButton onClick={onBack} aria-label="Retour à la liste" edge="start" sx={{ mb: 1 }}>
          <ArrowBackIcon />
        </IconButton>
      )}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Avatar variant="rounded" src={episode.imageUrl ?? undefined} alt="" sx={{ width: 88, height: 88, borderRadius: 3, bgcolor: 'divider' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography color="text.secondary" variant="body2">{episode.showTitle}</Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.75 }}>
            <Chip size="small" label={CATEGORY_LABELS[episode.category]} />
            <Chip size="small" variant="outlined" label={episode.language === 'fr' ? 'Français' : 'Anglais'} />
            {episode.transcriptType && <Chip size="small" variant="outlined" color="primary" label="Transcription" />}
          </Stack>
        </Box>
      </Stack>

      <Typography variant="h2" component="h1" sx={{ mb: 1 }}>{episode.title}</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
        {[formatWhen(episode.publishedAt), formatDuration(episode.durationSec)].filter(Boolean).join(' · ')}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="contained" startIcon={<OpenInNewIcon />} href={episode.audioUrl} target="_blank" rel="noopener noreferrer">
          Écouter
        </Button>
        <Button
          variant="outlined"
          startIcon={saved ? <BookmarkIcon /> : <BookmarkBorderIcon />}
          onClick={() => setState.mutate({ id: episode.id, state: saved ? 'seen' : 'saved' })}
          disabled={setState.isPending}
        >
          {saved ? 'Sauvegardé' : 'Sauvegarder'}
        </Button>
        {!saved && (
          <Button
            color="inherit"
            startIcon={<VisibilityOffOutlinedIcon />}
            onClick={() => {
              setState.mutate({ id: episode.id, state: 'dismissed' });
              onBack?.();
            }}
          >
            Écarter
          </Button>
        )}
      </Stack>

      {episode.description && (
        <Typography sx={{ fontFamily: readingFont, fontSize: '1.05rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {episode.description}
        </Typography>
      )}
    </Box>
  );
}
