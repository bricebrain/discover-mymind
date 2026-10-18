import YouTubeIcon from '@mui/icons-material/YouTube';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SubtitlesOutlinedIcon from '@mui/icons-material/SubtitlesOutlined';
import { Avatar, Box, ButtonBase, IconButton, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { formatDuration, formatWhen, type Episode } from '../api/episodes';
import { categoryColor } from '../app/theme';
import { formatClock } from '../player/MiniPlayer';
import { secureSrc, usePlayer, type Track } from '../player/PlayerProvider';

export const trackOf = (e: Episode): Track => ({
  targetType: 'episode', targetId: e.id, audioRef: e.audioUrl, src: secureSrc(e.audioUrl),
  title: e.title, subtitle: e.showTitle, imageUrl: e.imageUrl, durationSec: e.durationSec,
});

/** Petit égaliseur animé : « en cours de lecture ». */
export function PlayingBars({ active }: { active: boolean }) {
  return (
    <Box aria-hidden sx={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: 12 }}>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{
          width: 3, borderRadius: 1, bgcolor: 'secondary.main', height: active ? undefined : 4,
          animation: active ? `bars${i} .9s ${i * 0.15}s ease-in-out infinite alternate` : 'none',
          [`@keyframes bars${i}`]: { from: { height: 3 }, to: { height: 12 } },
        }} />
      ))}
    </Box>
  );
}

/** Carte d'épisode : pochette, émission, titre, méta, progression ; bouton de lecture direct. */
export function EpisodeCard({ episode, selected, onOpen }: { episode: Episode; selected?: boolean; onOpen: () => void }) {
  const theme = useTheme();
  const player = usePlayer();
  const youtube = episode.sourceType === 'youtube';
  const current = player.track?.targetType === 'episode' && player.track.targetId === episode.id;
  const playing = current && player.playing;
  const unseen = episode.state === 'new';
  const color = categoryColor(episode.category, theme.palette.mode);
  const inProgress = !current && episode.progressMs && episode.progressDurationMs && episode.progressCompleted !== 1;
  const pct = current && player.duration > 0 ? (player.position / player.duration) * 100
    : inProgress ? (episode.progressMs! / episode.progressDurationMs!) * 100 : 0;

  return (
    <Box sx={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: 4,
      bgcolor: selected ? 'action.selected' : 'transparent', transition: 'background-color .2s',
      '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
    }}>
      <ButtonBase onClick={onOpen} aria-current={selected ? 'true' : undefined}
        sx={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.25, borderRadius: 4 }}>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Avatar variant="rounded" src={episode.imageUrl ?? undefined} alt=""
            sx={{ width: 64, height: 64, borderRadius: 3, bgcolor: alpha(color, 0.18), color, fontWeight: 700 }}>
            {episode.showTitle.slice(0, 1)}
          </Avatar>
          {unseen && <Box aria-label="Nouveau" sx={{ position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: '50%', bgcolor: 'secondary.main', border: 2, borderColor: 'background.default' }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontWeight: 600, letterSpacing: '0.01em' }}>{youtube ? 'YouTube · ' : ''}{episode.showTitle}</Typography>
          </Stack>
          <Typography sx={{
            fontWeight: unseen ? 650 : 550, fontSize: '0.98rem', lineHeight: 1.32, color: episode.progressCompleted === 1 ? 'text.secondary' : 'text.primary',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {episode.title}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, color: 'text.secondary', minHeight: 18 }}>
            {current && <PlayingBars active={playing} />}
            <Typography variant="caption">
              {current ? `${formatClock(player.position)} / ${formatClock(player.duration)}`
                : [formatWhen(episode.publishedAt), formatDuration(episode.durationSec), episode.language.toUpperCase()].filter(Boolean).join(' · ')}
            </Typography>
            {episode.transcriptType && <SubtitlesOutlinedIcon titleAccess="Transcription disponible" sx={{ fontSize: 15 }} />}
            {episode.state === 'saved' && <BookmarkIcon titleAccess="Sauvegardé" color="primary" sx={{ fontSize: 15 }} />}
            {episode.progressCompleted === 1 && <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>· écouté</Typography>}
          </Stack>
          {pct > 0 && (
            <Box aria-label="Progression d’écoute" sx={{ mt: 0.75, height: 3, borderRadius: 2, bgcolor: 'action.hover', maxWidth: 180, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${Math.min(pct, 100)}%`, bgcolor: 'secondary.main' }} />
            </Box>
          )}
        </Box>
      </ButtonBase>
      <IconButton
        aria-label={youtube ? `Ouvrir ${episode.title}` : playing ? `Mettre en pause ${episode.title}` : `Écouter ${episode.title}`}
        onClick={() => youtube ? onOpen() : (current ? player.toggle() : player.play(trackOf(episode)))}
        sx={{
          mr: 0.75, flexShrink: 0, border: 1.5, borderColor: current ? 'primary.main' : 'divider',
          color: current ? 'primary.contrastText' : 'text.primary', bgcolor: current ? 'primary.main' : 'transparent',
          '&:hover': { bgcolor: current ? 'primary.main' : 'action.hover' },
        }}
      >
        {youtube ? <YouTubeIcon fontSize="small" /> : playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
      </IconButton>
    </Box>
  );
}
