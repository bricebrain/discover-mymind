import type { PaletteMode } from '@mui/material';
import { createTheme } from '@mui/material/styles';

const fontStack = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const readingStack = 'ui-serif, "New York", Charter, Georgia, serif';

/** Thème sobre, centré sur la lecture ; clair et sombre selon le système. */
export function buildTheme(mode: PaletteMode) {
  const light = mode === 'light';
  return createTheme({
    palette: {
      mode,
      primary: { main: light ? '#0F766E' : '#2DD4BF', contrastText: light ? '#FFFFFF' : '#06201D' },
      secondary: { main: light ? '#1E4069' : '#93C5FD' },
      background: { default: light ? '#F6F5F1' : '#111417', paper: light ? '#FFFFFF' : '#1A1E22' },
      text: { primary: light ? '#1C1F23' : '#E8EAED', secondary: light ? '#5B636B' : '#A3ABB3' },
      divider: light ? 'rgba(28,31,35,0.10)' : 'rgba(232,234,237,0.12)',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: fontStack,
      h1: { fontSize: '1.75rem', fontWeight: 750, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em' },
      h3: { fontSize: '1.05rem', fontWeight: 650 },
      body1: { lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 650 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44 } } },
      MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
      MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 72 } } },
    },
  });
}

export const readingFont = readingStack;
