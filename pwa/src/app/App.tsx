import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import PsychologyAltOutlinedIcon from '@mui/icons-material/PsychologyAltOutlined';
import { Alert, Box, Button, CircularProgress, CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { useMemo } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useSession } from '../api/auth';
import { EmptyTab } from '../pages/EmptyTab';
import { LoginPage } from '../pages/LoginPage';
import { SettingsPage } from '../pages/SettingsPage';
import { Shell } from './Shell';
import { buildTheme } from './theme';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <EmptyTab title="Explorer" icon={<ExploreOutlinedIcon />}>Les nouveaux épisodes de tes émissions apparaîtront ici.</EmptyTab> },
      { path: '/library', element: <EmptyTab title="Bibliothèque" icon={<AutoStoriesOutlinedIcon />}>Tes épisodes sauvegardés et tes contenus préparés seront rangés ici.</EmptyTab> },
      { path: '/mind', element: <EmptyTab title="My Mind" icon={<PsychologyAltOutlinedIcon />}>Tes réflexions, idées et questions vivront ici.</EmptyTab> },
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
  return session.data ? <RouterProvider router={router} /> : <LoginPage />;
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
