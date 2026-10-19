import { Alert, Box, Button, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useSession } from '../api/auth';
import { ExplorerPage } from '../pages/ExplorerPage';
import { ContentPage } from '../pages/ContentPage';
import { LibraryPage } from '../pages/LibraryPage';
import { LoginPage } from '../pages/LoginPage';
import { MindPage } from '../pages/MindPage';
import { ShowsPage } from '../pages/ShowsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SharePage } from '../mind/SharePage';
import { PreparationEventsProvider } from '../notifications/PreparationEventsProvider';
import { PlayerProvider } from '../player/PlayerProvider';
import { initOffline, isNetworkFailure, useOffline } from '../offline';
import { Shell } from './Shell';
import { buildTheme } from './theme';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <ExplorerPage /> },
      { path: '/shows', element: <ShowsPage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/library/:id', element: <ContentPage /> },
      { path: '/mind', element: <MindPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/share', element: <SharePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function Gate() {
  const session = useSession();
  const offlineState = useOffline();
  useEffect(() => { void initOffline(); }, []);
  // Hors ligne avec des téléchargements : l'app s'ouvre sur ce qui est disponible localement (chantier B).
  // Une révocation de session n'est découverte qu'au retour du réseau.
  const networkDown = session.isError && isNetworkFailure(session.error);
  // Une fois ouverte hors ligne, l'app le reste (supprimer le dernier téléchargement ne la ferme pas).
  const [offlineLatched, setOfflineLatched] = useState(false);
  const offlineOpen = networkDown && (offlineLatched || offlineState.records.some((r) => r.status === 'complete'));
  useEffect(() => { if (offlineOpen) setOfflineLatched(true); }, [offlineOpen]);
  useEffect(() => {
    if (offlineOpen && router.state.location.pathname === '/') void router.navigate('/library?view=downloads', { replace: true });
  }, [offlineOpen]);
  if (session.isPending || (networkDown && !offlineState.ready)) {
    return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }
  if (session.isError && !offlineOpen) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
        <Alert severity="warning" action={<Button onClick={() => void session.refetch()}>Réessayer</Button>}>
          {session.error.message}
        </Alert>
      </Box>
    );
  }
  const open = offlineOpen || session.data!.authDisabled || session.data!.session !== null;
  return open ? <PlayerProvider><PreparationEventsProvider><RouterProvider router={router} /></PreparationEventsProvider></PlayerProvider> : <LoginPage />;
}

export function App() {
  // Thème clair uniquement, quel que soit le réglage du téléphone.
  const theme = useMemo(() => buildTheme('light'), []);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Gate />
    </ThemeProvider>
  );
}
