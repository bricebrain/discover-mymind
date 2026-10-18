import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import { Box, Button, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

/** Bandeau discret hors ligne, avec un accès direct aux téléchargements. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
    <CloudOffOutlinedIcon fontSize="small" color="action" />
    <Typography variant="body2" sx={{ flex: 1 }}>Hors ligne : les versions téléchargées restent disponibles.</Typography>
    <Button size="small" component={Link} to="/library?view=downloads">Téléchargements</Button>
  </Box>;
}
