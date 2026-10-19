import { NotificationSettings } from '../notifications/NotificationSettings';
import DownloadIcon from '@mui/icons-material/Download';
import LogoutIcon from '@mui/icons-material/Logout';
import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, List, ListItem, ListItemText, Paper, Stack, Typography,
} from '@mui/material';
import { useLogout, useRevokeOthers, useRevokeSession, useSession, useSessions } from '../api/auth';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

/** Déclenche l’enregistrement d’un fichier par le navigateur. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Mes données : export complet (notes et corbeille, contenus préparés avec textes et traductions, dossiers,
 * progression) en JSON + Markdown lisible ; l’export historique (notes, émissions, épisodes sauvegardés) reste
 * disponible. Les audios ne sont pas inclus : l’export liste leurs empreintes et tailles.
 */
function ExportSection() {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const date = new Date().toISOString().slice(0, 10);
  const run = async (download: () => Promise<void>) => {
    setState('busy');
    try {
      await download();
      setState('idle');
    } catch {
      setState('error');
    }
  };
  /** Export complet v2 : une requête, deux fichiers — le JSON contient aussi le document Markdown. */
  const exportAll = () => run(async () => {
    const res = await fetch('/api/export', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    saveBlob(new Blob([text], { type: 'application/json' }), `discover-export-${date}.json`);
    saveBlob(new Blob([JSON.parse(text).markdown as string], { type: 'text/markdown' }), `discover-export-${date}.md`);
  });
  /** Export historique v1, inchangé. */
  const exportLegacy = () => run(async () => {
    const res = await fetch('/api/export?v=1', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    saveBlob(await res.blob(), `discover-export-${date}.json`);
  });
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h2" component="h2" sx={{ mb: 1 }}>Mes données</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Récupère tout ce qui t’appartient : tes notes (corbeille incluse) et leurs liens, tes contenus préparés avec
        leurs textes et traductions, tes dossiers, tes émissions et ta progression d’écoute — dans un JSON complet et
        un document Markdown lisible. Les audios ne sont pas inclus : l’export liste leurs empreintes et leurs tailles.
      </Typography>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => void exportAll()} disabled={state === 'busy'}>
          {state === 'busy' ? 'Préparation…' : 'Exporter tout (JSON + Markdown)'}
        </Button>
        <Button variant="outlined" onClick={() => void exportLegacy()} disabled={state === 'busy'}>
          Export historique (notes et émissions)
        </Button>
      </Stack>
      {state === 'error' && <Alert severity="warning" sx={{ mt: 1.5 }}>Export impossible pour l’instant.</Alert>}
    </Box>
  );
}

export function SettingsPage() {
  const auth = useSession();
  if (auth.data?.authDisabled) {
    return (
      <Box sx={{ px: 2, pt: 2.5, pb: 4, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h1" component="h1" sx={{ mb: 3 }}>Réglages</Typography>
        <Typography variant="h2" component="h2" sx={{ mb: 1 }}>Connexion</Typography>
        <Alert severity="info">
          La connexion est désactivée pour l’instant : l’app s’ouvre sans phrase secrète.
          Elle pourra être réactivée plus tard, sans rien perdre.
        </Alert>
        <NotificationSettings />
      <ExportSection />
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
      <NotificationSettings />
      <ExportSection />
    </Box>
  );
}
