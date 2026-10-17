import LogoutIcon from '@mui/icons-material/Logout';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, List, ListItem, ListItemText, Paper, Stack, Typography,
} from '@mui/material';
import { useLogout, useRevokeOthers, useRevokeSession, useSession, useSessions } from '../api/auth';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function SettingsPage() {
  const auth = useSession();
  if (auth.data?.authDisabled) {
    return (
      <Box sx={{ px: 2, pt: 2, pb: 4, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h1" component="h1" sx={{ mb: 3 }}>Réglages</Typography>
        <Typography variant="h2" component="h2" sx={{ mb: 1 }}>Connexion</Typography>
        <Alert severity="info">
          La connexion est désactivée pour l’instant : l’app s’ouvre sans phrase secrète.
          Elle pourra être réactivée plus tard, sans rien perdre.
        </Alert>
      </Box>
    );
  }
  return <DevicesSettings />;
}

function DevicesSettings() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOthers();
  const logout = useLogout();
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;
  // L'appareil courant d'abord, puis les autres du plus récent au plus ancien.
  const ordered = sessions.data ? [...sessions.data].sort((a, b) => Number(b.current) - Number(a.current)) : [];

  return (
    <Box sx={{ px: 2, pt: 2, pb: 4, maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h1" component="h1" sx={{ mb: 3 }}>Réglages</Typography>

      <Typography variant="h2" component="h2" sx={{ mb: 1 }}>Appareils connectés</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Chaque appareil a sa propre session. Révoque celles que tu ne reconnais pas.
      </Typography>

      <Paper variant="outlined">
        {sessions.isPending && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
        {sessions.isError && <Alert severity="error">Impossible de charger les sessions.</Alert>}
        <List disablePadding>
          {ordered.map((s, i) => (
            <Box key={s.id}>
              {i > 0 && <Divider component="li" />}
              <ListItem
                sx={{ pr: s.current ? 2 : 14 }}
                secondaryAction={!s.current && (
                  <Button color="error" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
                    Révoquer
                  </Button>
                )}
              >
                <ListItemText
                  primary={<Stack direction="row" spacing={1} alignItems="center">
                    <span>{s.label ?? 'Appareil'}</span>
                    {s.current && <Chip size="small" color="primary" label="Cet appareil" />}
                  </Stack>}
                  secondary={`Ouverte le ${formatDate(s.createdAt)} · vue le ${formatDate(s.lastSeenAt)}`}
                />
              </ListItem>
            </Box>
          ))}
        </List>
      </Paper>

      <Stack spacing={1.5} sx={{ mt: 2 }}>
        <Button variant="outlined" color="error" disabled={others === 0 || revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
          Déconnecter les autres appareils{others > 0 ? ` (${others})` : ''}
        </Button>
        <Button variant="text" startIcon={<LogoutIcon />} onClick={() => logout.mutate()} disabled={logout.isPending}>
          Se déconnecter de cet appareil
        </Button>
      </Stack>
    </Box>
  );
}
