import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Alert, Box, Button, Card, CardActionArea, CardContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes, offline, removeDownload, useOffline } from './index';
import { usePlayer } from '../player/PlayerProvider';

const STATUS = { downloading: 'Téléchargement…', interrupted: 'Interrompu', failed: 'Échec', broken: 'Fichier absent' } as const;

/** Téléchargements de l'appareil : accessibles sans réseau, avec l'espace utilisé et la suppression locale. */
export function DownloadsList() {
  const { ready, records, active } = useOffline();
  const player = usePlayer();
  const [space, setSpace] = useState<{ downloads: number; usage: number | null; quota: number | null } | null>(null);
  useEffect(() => { void offline.usage().then(setSpace); }, [records]);
  const total = records.reduce((s, r) => s + r.audioBytes + r.textBytes, 0);

  return <Box sx={{ pt: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      {records.length ? `${records.length} version${records.length > 1 ? 's' : ''} · ${formatBytes(total)} sur cet appareil` : ''}
      {space?.quota ? ` · espace libre estimé ${formatBytes(Math.max(0, space.quota - (space.usage ?? 0)))}` : ''}
    </Typography>
    {ready && !records.length && <Typography color="text.secondary">
      Aucun téléchargement. Ouvre un contenu préparé et choisis « Télécharger pour l’écoute hors ligne » sous la version.
    </Typography>}
    <Stack spacing={1}>
      {records.map((r) => {
        const progress = active[r.key];
        return <Card variant="outlined" key={r.key} sx={{ display: 'flex', alignItems: 'center' }}>
          <CardActionArea sx={{ flex: 1 }} component={Link} to={`/library/${r.contentId}?v=${encodeURIComponent(r.variantKey)}`}
            disabled={r.status !== 'complete'}>
            <CardContent>
              <Typography fontWeight={600}>{r.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {r.label} · {r.status === 'complete' ? formatBytes(r.audioBytes + r.textBytes)
                  : progress?.total ? `${STATUS.downloading} ${Math.round(progress.received / progress.total * 100)} %` : STATUS[r.status]}
              </Typography>
              {r.status !== 'complete' && r.error && <Typography variant="caption" color="warning.main">{r.error}</Typography>}
            </CardContent>
          </CardActionArea>
          <Tooltip title="Supprimer le téléchargement">
            <IconButton aria-label={`Supprimer le téléchargement de ${r.title}`} onClick={() => void removeDownload(r.key, player)} sx={{ mx: 0.5 }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Card>;
      })}
    </Stack>
    {records.length > 1 && <Button color="inherit" sx={{ mt: 2, color: 'text.secondary' }} onClick={() => {
      if (window.confirm('Supprimer tous les téléchargements de cet appareil ?')) void Promise.all(records.map((r) => removeDownload(r.key, player)));
    }}>Tout supprimer</Button>}
    {!navigator.onLine && <Alert severity="info" sx={{ mt: 2 }}>Hors ligne : seules les versions téléchargées s’ouvrent.</Alert>}
  </Box>;
}
