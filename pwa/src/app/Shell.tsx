import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import PsychologyAltOutlinedIcon from '@mui/icons-material/PsychologyAltOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { AppBar, BottomNavigation, BottomNavigationAction, Box, IconButton, Paper, Toolbar, Typography } from '@mui/material';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

export const TABS = [
  { path: '/', label: 'Explorer', icon: <ExploreOutlinedIcon /> },
  { path: '/library', label: 'Bibliothèque', icon: <AutoStoriesOutlinedIcon /> },
  { path: '/mind', label: 'My Mind', icon: <PsychologyAltOutlinedIcon /> },
] as const;

/** Cadre de l'app : barre du haut, contenu de l'onglet, navigation à 3 onglets en bas. */
export function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.findIndex((t) => (t.path === '/' ? pathname === '/' : pathname.startsWith(t.path)));

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="inherit" elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider', pt: 'env(safe-area-inset-top)' }}>
        <Toolbar sx={{ minHeight: 52 }}>
          <Box component="img" src="/icons/icon.svg" alt="" sx={{ width: 28, height: 28, mr: 1.25 }} />
          <Typography variant="h3" component="span" sx={{ flex: 1 }}>Discover</Typography>
          <IconButton component={Link} to="/settings" aria-label="Réglages" edge="end"
            color={pathname === '/settings' ? 'primary' : 'default'}>
            <SettingsOutlinedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, pb: 'calc(56px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </Box>

      <Paper component="nav" aria-label="Navigation principale" elevation={0}
        sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, borderTop: 1, borderColor: 'divider', pb: 'env(safe-area-inset-bottom)' }}>
        <BottomNavigation showLabels value={active === -1 ? false : active} onChange={(_e, i: number) => navigate(TABS[i]!.path)}>
          {TABS.map((t) => <BottomNavigationAction key={t.path} label={t.label} icon={t.icon} />)}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
