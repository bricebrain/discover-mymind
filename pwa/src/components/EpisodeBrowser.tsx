import { Alert, Box, Button, CircularProgress, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useExplorer, type ExplorerFilters } from '../api/episodes';
import { EpisodeCard } from './EpisodeCard';
import { EpisodeDetail } from './EpisodeDetail';

/**
 * Liste d'épisodes + détail (§ 9.1). Plié (< 600 px) : la liste, puis le détail en plein écran.
 * Déplié (≥ 600 px) : liste et détail côte à côte. L'épisode ouvert est dans l'URL (?e=…),
 * donc plier ou déplier le Fold7 garde la sélection.
 */
export function EpisodeBrowser({ filters, header, empty }: { filters: ExplorerFilters; header: ReactNode; empty: ReactNode }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const [params, setParams] = useSearchParams();
  const selected = params.get('e');
  const explorer = useExplorer(filters);
  const episodes = explorer.data?.pages.flatMap((p) => p.episodes) ?? [];

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('e', id);
    else next.delete('e');
    setParams(next, { replace: wide });
  };

  const list = (
    <Box sx={{ px: 1, pt: 2, pb: 4 }}>
      <Box sx={{ px: 1 }}>{header}</Box>
      {explorer.isPending && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
      {explorer.isError && <Alert severity="warning" sx={{ m: 1 }}>{explorer.error.message}</Alert>}
      {explorer.isSuccess && episodes.length === 0 && (
        <Typography color="text.secondary" sx={{ px: 1, py: 6, textAlign: 'center' }}>{empty}</Typography>
      )}
      <Stack spacing={0.5}>
        {episodes.map((e) => <EpisodeCard key={e.id} episode={e} selected={e.id === selected} onOpen={() => open(e.id)} />)}
      </Stack>
      {explorer.hasNextPage && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button onClick={() => void explorer.fetchNextPage()} disabled={explorer.isFetchingNextPage}>
            {explorer.isFetchingNextPage ? 'Chargement…' : 'Plus d’épisodes'}
          </Button>
        </Box>
      )}
    </Box>
  );

  if (!wide) return selected ? <EpisodeDetail id={selected} onBack={() => window.history.length > 1 ? window.history.back() : open(null)} /> : list;

  return (
    // Deux colonnes de hauteur fixe qui défilent chacune de leur côté (barre du haut 52 px, navigation 56 px, mini-lecteur).
    <Box sx={{
      display: 'grid', gridTemplateColumns: 'minmax(300px, 5fr) 6fr',
      height: 'calc(100dvh - 52px - 56px - var(--player-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
    }}>
      <Box sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>{list}</Box>
      <Box sx={{ overflowY: 'auto' }}>
        {selected ? <EpisodeDetail id={selected} /> : (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center', mt: 8 }}>Choisis un épisode pour voir son détail.</Typography>
        )}
      </Box>
    </Box>
  );
}
