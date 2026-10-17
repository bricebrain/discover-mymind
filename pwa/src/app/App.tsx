import PsychologyAltOutlinedIcon from '@mui/icons-material/PsychologyAltOutlined';
import { Alert, Box, Button, CircularProgress, CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { useMemo } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useSession } from '../api/auth';
import { EmptyTab } from '../pages/EmptyTab';
import { ExplorerPage } from '../pages/ExplorerPage';
import { LibraryPage } from '../pages/LibraryPage';
import { LoginPage } from '../pages/LoginPage';
import { ShowsPage } from '../pages/ShowsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { Shell } from './Shell';
import { buildTheme } from './theme';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <ExplorerPage /> },
      { path: '/shows', element: <ShowsPage /> },
      { path: '/library', element: <LibraryPage /> },
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
