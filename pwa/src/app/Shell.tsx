import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import PsychologyAltOutlinedIcon from '@mui/icons-material/PsychologyAltOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { BottomNavigation, BottomNavigationAction, Box, IconButton, Toolbar, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MiniPlayer } from '../player/MiniPlayer';
import { OfflineBanner } from '../offline/OfflineBanner';
import { fonts } from './theme';

export const TABS = [
  { path: '/', label: 'Explorer', icon: <ExploreOutlinedIcon /> },
  { path: '/library', label: 'Bibliothèque', icon: <AutoStoriesOutlinedIcon /> },
  { path: '/mind', label: 'My Mind', icon: <PsychologyAltOutlinedIcon /> },
] as const;

/** Hauteurs fixes du cadre, utilisées par les mises en page en deux colonnes. */
export const APP_BAR_H = 52;
export const NAV_H = 64;

/** Cadre de l'app : barre du haut translucide, contenu, mini-lecteur flottant et navigation en bas. */
export function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.findIndex((t) => (t.path === '/' ? pathname === '/' : pathname.startsWith(t.path)));

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={(t) => ({
        position: 'sticky', top: 0, zIndex: t.zIndex.appBar, pt: 'env(safe-area-inset-top)',
        bgcolor: alpha(t.palette.background.default, 0.82), backdropFilter: 'saturate(1.4) blur(14px)',
        borderBottom: 1, borderColor: 'divider',
      })}>
        <Toolbar sx={{ minHeight: `${APP_BAR_H}px !important`, px: { xs: 2 } }}>
          <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.primary', textDecoration: 'none', flex: 1 }}>
            <Box component="img" src="/icons/icon.svg" alt="" sx={{ width: 26, height: 26, borderRadius: 1.5 }} />
            <Typography component="span" sx={{ fontFamily: fonts.display, fontWeight: 650, fontSize: '1.2rem', letterSpacing: '-0.01em' }}>
              Discover
            </Typography>
          </Box>
          <IconButton component={Link} to="/settings" aria-label="Réglages" edge="end" color={pathname === '/settings' ? 'primary' : 'default'}>
            <SettingsOutlinedIcon />
          </IconButton>
        </Toolbar>
        <OfflineBanner />
      </Box>

      <Box component="main" sx={{ flex: 1, pb: `calc(${NAV_H}px + var(--player-h, 0px) + env(safe-area-inset-bottom))` }}>
        <Outlet />
      </Box>

      <Box component="nav" aria-label="Navigation principale" sx={(t) => ({
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: t.zIndex.appBar, pb: 'env(safe-area-inset-bottom)',
        bgcolor: alpha(t.palette.background.default, 0.92), backdropFilter: 'saturate(1.4) blur(14px)',
        borderTop: 1, borderColor: 'divider',
      })}>
        <MiniPlayer />
        <BottomNavigation showLabels value={active === -1 ? false : active} onChange={(_e, i: number) => navigate(TABS[i]!.path)}>
          {TABS.map((t) => <BottomNavigationAction key={t.path} label={t.label} icon={t.icon} />)}
        </BottomNavigation>
      </Box>
    </Box>
  );
}
