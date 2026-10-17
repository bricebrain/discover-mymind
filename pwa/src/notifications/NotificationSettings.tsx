import { Alert,Box,Button,Chip,Stack,Typography } from '@mui/material';
import { useNotifications } from './useNotifications';
import { usePreparationLive } from './PreparationEventsProvider';

export function NotificationSettings() {
  const n=useNotifications();const live=usePreparationLive();const busy=n.enable.isPending || n.disable.isPending;
  return <Box sx={{mt:4}}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{mb:1}}>
      <Typography variant="h2" component="h2">Préparations et notifications</Typography>
      <Chip size="small" variant="outlined" label={live?'Suivi en direct':'Suivi périodique'} color={live?'success':'default'} />
    </Stack>
    <Typography color="text.secondary" sx={{mb:2}}>Reçois une notification quand une préparation est prête, attend ta relecture ou a échoué, même lorsque Discover est fermé. Le titre de l’épisode reste privé.</Typography>
    {!n.supported && <Alert severity="info">Les notifications ne sont pas disponibles dans ce navigateur. Essaie Chrome sur ton téléphone.</Alert>}
    {n.config.isError && <Alert severity="warning" action={<Button onClick={()=>void n.config.refetch()}>Réessayer</Button>}>Impossible de charger les réglages des notifications.</Alert>}
    {n.supported && n.config.data && !n.config.data.configured && <Alert severity="info">Les notifications ne sont pas encore disponibles sur le serveur.</Alert>}
    {n.supported && n.permission==='denied' && <Alert severity="info">Les notifications sont bloquées. Autorise-les dans les réglages du navigateur pour Discover.</Alert>}
    {n.supported && n.config.data?.configured && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Button variant="outlined" disabled={busy || (n.permission==='denied' && !n.config.data?.enabled)} onClick={()=>n.config.data?.enabled?n.disable.mutate():n.enable.mutate()}>
        {busy?'Mise à jour…':n.config.data?.enabled?'Désactiver sur cet appareil':'Activer sur cet appareil'}
      </Button>
      {n.active && <Button disabled={n.test.isPending} onClick={()=>n.test.mutate()}>Envoyer une notification de test</Button>}
    </Stack>}
    {n.error && <Alert severity="warning" sx={{mt:1}}>{n.error.message}</Alert>}
    {n.test.isSuccess && <Alert severity="success" sx={{mt:1}}>Notification de test demandée. Vérifie sa réception sur cet appareil.</Alert>}
  </Box>;
}
