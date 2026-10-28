import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { checkForAppUpdate } from '../pwa/updates';

export function AppUpdateSection() {
  const update = useMutation({ mutationFn: checkForAppUpdate });
  return <Box component="section" aria-label="Mises à jour de Discover" sx={{ mt: 3 }}>
    <Stack spacing={1.5}>
      <Typography component="h2" variant="h6">Mises à jour de Discover</Typography>
      <Typography variant="body2">Vérifie la version de l’interface sans supprimer tes notes ni tes téléchargements.</Typography>
      <Button variant="outlined" disabled={update.isPending} onClick={() => update.mutate()} sx={{ alignSelf: 'flex-start' }}>
        {update.isPending ? 'Vérification…' : 'Rechercher une mise à jour'}
      </Button>
      {update.isSuccess && <Alert severity="info">Vérification terminée. Si une nouvelle version est disponible, Discover la charge automatiquement.</Alert>}
      {update.isError && <Alert severity="warning">{update.error.message}</Alert>}
    </Stack>
  </Box>;
}
