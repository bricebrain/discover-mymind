import { Alert, Box, Button, CircularProgress, CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { useMemo } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useSession } from '../api/auth';
import { ExplorerPage } from '../pages/ExplorerPage';
import { ContentPage } from '../pages/ContentPage';
import { LibraryPage } from '../pages/LibraryPage';
import { LoginPage } from '../pages/LoginPage';
import { MindPage } from '../pages/MindPage';
import { ShowsPage } from '../pages/ShowsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { PlayerProvider } from '../player/PlayerProvider';
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
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function Gate() {
  const session = useSession();
  if (session.isPending) {
    return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }
  if (session.isError) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
        <Alert severity="warning" action={<Button onClick={() => void session.refetch()}>Réessayer</Button>}>
          {session.error.message}
        </Alert>
      </Box>
    );
  }
  const open = session.data.authDisabled || session.data.session !== null;
  return open ? <PlayerProvider><RouterProvider router={router} /></PlayerProvider> : <LoginPage />;
}

export function App() {
  const dark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const theme = useMemo(() => buildTheme(dark ? 'dark' : 'light'), [dark]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <Gate />
    </ThemeProvider>
  );
}
