import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Alert, Avatar, Box, Button, ButtonBase, CircularProgress, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Fragment, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useExplorer, type Episode, type ExplorerFilters } from '../api/episodes';
import { fonts } from '../app/theme';
import { formatClock } from '../player/MiniPlayer';
import { usePlayer } from '../player/PlayerProvider';
import { EpisodeCard, trackOf } from './EpisodeCard';
import { EpisodeDetail } from './EpisodeDetail';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** « Aujourd'hui », « Hier », puis « Lundi 12 octobre ». */
export function dayLabel(iso: string | null, now = new Date()): string {
  if (!iso) return 'Sans date';
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff <= 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  const label = dayFmt.format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Épisode commencé mais pas fini : grande carte « À reprendre ». */
function ResumeCard({ episode }: { episode: Episode }) {
  const player = usePlayer();
  const pct = (episode.progressMs! / episode.progressDurationMs!) * 100;
  const left = (episode.progressDurationMs! - episode.progressMs!) / 1000;
  return (
    <ButtonBase onClick={() => player.play(trackOf(episode))} sx={(t) => ({
      width: '100%', textAlign: 'left', display: 'flex', gap: 1.5, alignItems: 'center', p: 1.5, borderRadius: 5,
      bgcolor: t.palette.mode === 'light' ? '#FFFFFF' : '#221F1A', border: 1, borderColor: 'divider',
      boxShadow: t.palette.mode === 'light' ? '0 4px 18px rgba(30,27,22,0.07)' : 'none',
    })}>
      <Avatar variant="rounded" src={episode.imageUrl ?? undefined} alt="" sx={{ width: 56, height: 56, borderRadius: 3 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="overline" color="secondary" sx={{ lineHeight: 1.2 }}>À reprendre · encore {formatClock(left)}</Typography>
        <Typography noWrap sx={{ fontWeight: 650 }}>{episode.title}</Typography>
        <Box sx={{ mt: 0.75, height: 3, borderRadius: 2, bgcolor: 'action.hover', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: 'secondary.main' }} />
        </Box>
      </Box>
      <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>
        <PlayArrowIcon />
      </Box>
    </ButtonBase>
  );
}

/**
 * Liste d'épisodes groupés par jour + détail (§ 9.1). Plié (< 600 px) : la liste, puis le détail en
 * plein écran. Déplié (≥ 600 px) : côte à côte. L'épisode ouvert est dans l'URL (?e=…).
 */
export function EpisodeBrowser({ filters, header, empty, showResume = false }: {
  filters: ExplorerFilters; header: ReactNode; empty: ReactNode; showResume?: boolean;
}) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const [params, setParams] = useSearchParams();
  const selected = params.get('e');
  const player = usePlayer();
  const explorer = useExplorer(filters);
  const episodes = explorer.data?.pages.flatMap((p) => p.episodes) ?? [];
  const resume = showResume
    ? episodes.find((e) => e.sourceType !== 'youtube' && e.progressMs && e.progressDurationMs && e.progressCompleted !== 1 && e.progressMs > 5000
        && !(player.track?.targetType === 'episode' && player.track.targetId === e.id))
    : undefined;

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('e', id);
    else next.delete('e');
    next.delete('v'); // la version choisie appartient à l'épisode précédent
    setParams(next, { replace: wide });
  };

  let lastDay = '';
  const list = (
    <Box sx={{ px: { xs: 1, sm: 1.5 }, pt: 2.5, pb: 4, maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ px: 1 }}>{header}</Box>
      {resume && <Box sx={{ px: 0.5, mt: 1, mb: 1 }}><ResumeCard episode={resume} /></Box>}
      {explorer.isPending && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
      {explorer.isError && <Alert severity="warning" sx={{ m: 1 }}>{explorer.error.message}</Alert>}
      {explorer.isSuccess && episodes.length === 0 && (
        <Typography color="text.secondary" sx={{ px: 2, py: 8, textAlign: 'center', fontFamily: fonts.reading, fontSize: '1.05rem' }}>{empty}</Typography>
      )}
      <Stack spacing={0.25} sx={{ animation: 'riseIn .3s ease-out' }}>
        {episodes.map((e) => {
          const day = dayLabel(e.publishedAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <Fragment key={e.id}>
              {showDay && (
                <Typography variant="overline" color="text.secondary" component="h2" sx={{ px: 1.25, pt: 2, pb: 0.25 }}>{day}</Typography>
              )}
              <EpisodeCard episode={e} selected={e.id === selected} onOpen={() => open(e.id)} />
            </Fragment>
          );
        })}
      </Stack>
      {explorer.hasNextPage && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button variant="outlined" onClick={() => void explorer.fetchNextPage()} disabled={explorer.isFetchingNextPage}>
            {explorer.isFetchingNextPage ? 'Chargement…' : 'Plus de contenus'}
          </Button>
        </Box>
      )}
    </Box>
  );

  if (!wide) return selected ? <EpisodeDetail id={selected} onBack={() => window.history.length > 1 ? window.history.back() : open(null)} /> : list;

  return (
    // Deux colonnes de hauteur fixe qui défilent chacune de leur côté (barre du haut 52 px, navigation 64 px, mini-lecteur).
    <Box sx={{
      display: 'grid', gridTemplateColumns: 'minmax(320px, 5fr) 6fr',
      height: 'calc(100dvh - 52px - 64px - var(--player-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
    }}>
      <Box sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>{list}</Box>
      <Box sx={{ overflowY: 'auto' }}>
        {selected ? <EpisodeDetail id={selected} /> : (
          <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', px: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography sx={{ fontFamily: fonts.display, fontSize: '1.4rem', mb: 1, color: 'text.primary' }}>Choisis un contenu</Typography>
            <Typography sx={{ maxWidth: 320 }}>Son détail et sa transcription s’afficheront ici, pendant que la liste reste à portée.</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
