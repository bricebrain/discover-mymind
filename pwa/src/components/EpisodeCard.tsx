import BookmarkIcon from '@mui/icons-material/Bookmark';
import SubtitlesOutlinedIcon from '@mui/icons-material/SubtitlesOutlined';
import { Avatar, Box, ButtonBase, Stack, Typography } from '@mui/material';
import { formatDuration, formatWhen, type Episode } from '../api/episodes';

/** Carte d'épisode dans une liste : vignette, émission, titre, date, durée, langue. */
export function EpisodeCard({ episode, selected, onOpen }: { episode: Episode; selected?: boolean; onOpen: () => void }) {
  const unseen = episode.state === 'new';
  return (
    <ButtonBase
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      sx={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, borderRadius: 2,
        bgcolor: selected ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
      }}
    >
      <Avatar variant="rounded" src={episode.imageUrl ?? undefined} alt="" sx={{ width: 56, height: 56, borderRadius: 2, bgcolor: 'divider' }}>
        {episode.showTitle.slice(0, 1)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap component="div">{episode.showTitle}</Typography>
        <Typography
          sx={{ fontWeight: unseen ? 650 : 500, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {episode.title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, color: 'text.secondary' }}>
          <Typography variant="caption">{formatWhen(episode.publishedAt)}</Typography>
          {episode.durationSec ? <Typography variant="caption">· {formatDuration(episode.durationSec)}</Typography> : null}
          <Typography variant="caption">· {episode.language.toUpperCase()}</Typography>
          {episode.transcriptType && <SubtitlesOutlinedIcon titleAccess="Transcription disponible" sx={{ fontSize: 16 }} />}
          {episode.state === 'saved' && <BookmarkIcon titleAccess="Sauvegardé" color="primary" sx={{ fontSize: 16 }} />}
        </Stack>
      </Box>
    </ButtonBase>
  );
}
