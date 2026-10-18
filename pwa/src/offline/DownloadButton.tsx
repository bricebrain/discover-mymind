import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { downloadable, formatBytes, offline, removeDownload, startDownload, useDownload } from './index';
import { usePlayer } from '../player/PlayerProvider';

/** Téléchargement explicite de la version affichée : progression, annulation, état, mise à jour et suppression. */
export function DownloadButton({ detail, variant }: { detail: ContentDetail; variant: ContentVariant }) {
  const state = useDownload(detail, variant);
  const player = usePlayer();
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const { key, record, active, outdated } = state;
  const start = () => {
    setError(null);
    startDownload(detail, variant).catch((e: Error) => setError(e.message));
  };

  if (!downloadable(variant)) {
    return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
      Diffusée par l’éditeur : cette version n’est pas téléchargeable.
    </Typography>;
  }
  if (active) {
    const pct = active.total ? Math.round((active.received / active.total) * 100) : null;
    return <Box sx={{ mt: 1.5 }} role="status">
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          Téléchargement… {pct !== null ? `${pct} %` : ''} {active.received ? `· ${formatBytes(active.received)}` : ''}
        </Typography>
        <Button size="small" onClick={() => offline.cancel(key)}>Annuler</Button>
      </Stack>
      <LinearProgress variant={pct === null ? 'indeterminate' : 'determinate'} value={pct ?? 0} sx={{ borderRadius: 1 }} />
    </Box>;
  }
  return <Box sx={{ mt: 1.5 }}>
    {record?.status === 'complete' ? (
      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
        <CloudDoneOutlinedIcon fontSize="small" color={outdated ? 'warning' : 'success'} />
        <Typography variant="body2" sx={{ flex: 1 }}>
          {outdated ? 'Téléchargée depuis une ancienne publication' : 'Disponible hors ligne'} · {formatBytes(record.audioBytes + record.textBytes)}
        </Typography>
        {outdated && <Button size="small" onClick={start}>Mettre à jour</Button>}
        <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={() => void removeDownload(key, player)}>Supprimer le téléchargement</Button>
      </Stack>
    ) : (
      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
        <Button size="small" variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={start}>
          {record && record.status !== 'downloading' ? 'Réessayer le téléchargement' : 'Télécharger pour l’écoute hors ligne'}
        </Button>
        {variant.audio && <Typography variant="caption" color="text.secondary">Audio et transcription de cette version</Typography>}
      </Stack>
    )}
    {(error || (record && record.status !== 'complete' && record.error)) && (
      <Alert severity="warning" sx={{ mt: 1 }}>{error ?? record?.error}</Alert>
    )}
  </Box>;
}
