import type { PaletteMode } from '@mui/material';
import { alpha, createTheme } from '@mui/material/styles';
import type { Category } from '../api/episodes';

/**
 * Identité « journal de bord » : papier chaud et encre en clair, charbon chaud en sombre,
 * sarcelle profonde pour l'action, ambre pour ce qu'on écoute. Titres en Fraunces,
 * interface en Inter, lecture longue en Literata (polices auto-hébergées, CSP font-src 'self').
 */
export const fonts = {
  display: '"Instrument Serif", ui-serif, Georgia, serif',
  ui: '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  reading: '"Literata Variable", ui-serif, "New York", Charter, Georgia, serif',
} as const;

/** Compatibilité avec les écrans existants. */
export const readingFont = fonts.reading;

interface Tokens {
  bg: string;
  surface: string;
  raised: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  accentInk: string;
  amber: string;
  amberSoft: string;
}

export const tokensFor = (mode: PaletteMode): Tokens => (mode === 'light'
  ? {
      bg: '#FAFAF9', surface: '#FFFFFF', raised: '#FFFFFF', ink: '#18181B', muted: '#71717A', faint: '#A1A1AA',
      line: '#E4E4E7', accent: '#0D5F56', accentInk: '#FFFFFF', amber: '#9A3412', amberSoft: '#FFF1E6',
    }
  : {
      bg: '#0C0C0E', surface: '#17171A', raised: '#1F1F23', ink: '#F4F4F5', muted: '#A1A1AA', faint: '#71717A',
      line: '#2C2C31', accent: '#5EC9BB', accentInk: '#06201C', amber: '#FB923C', amberSoft: 'rgba(251,146,60,0.14)',
    });

/** Couleur discrète par catégorie (pastille, puce). */
export const CATEGORY_COLORS: Record<Category, { light: string; dark: string }> = {
  tech: { light: '#2F5FB3', dark: '#86AEF5' },
  science: { light: '#7A4FB0', dark: '#C3A3F0' },
  economy: { light: '#2E7D4F', dark: '#7FD3A1' },
  news: { light: '#B4442F', dark: '#F29A86' },
  football: { light: '#1F6E8C', dark: '#7CC9E6' },
  stories: { light: '#A8611A', dark: '#EDB878' },
  humour: { light: '#846344', dark: '#D8B492' },
};

export const categoryColor = (c: Category, mode: PaletteMode) => CATEGORY_COLORS[c][mode];

export function buildTheme(mode: PaletteMode) {
  const t = tokensFor(mode);
  const light = mode === 'light';
  return createTheme({
    palette: {
      mode,
      primary: { main: t.accent, contrastText: t.accentInk },
      secondary: { main: t.amber },
      warning: { main: t.amber },
      background: { default: t.bg, paper: t.surface },
      text: { primary: t.ink, secondary: t.muted, disabled: t.faint },
      divider: t.line,
      action: { hover: alpha(t.ink, 0.05), selected: alpha(t.accent, light ? 0.1 : 0.16) },
    },
    // Échelle des arrondis : les valeurs numériques `borderRadius` des sx valent × 4 px.
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: fonts.ui,
      h1: { fontFamily: fonts.display, fontSize: '2.5rem', fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.05 },
      h2: { fontFamily: fonts.display, fontSize: '1.7rem', fontWeight: 400, letterSpacing: '-0.005em', lineHeight: 1.15 },
      h3: { fontSize: '1.02rem', fontWeight: 650, letterSpacing: '-0.01em' },
      body1: { lineHeight: 1.55 },
      body2: { lineHeight: 1.5 },
      overline: { fontWeight: 700, letterSpacing: '0.12em', fontSize: '0.68rem', lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 650, letterSpacing: '-0.005em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: t.bg, WebkitTapHighlightColor: 'transparent', fontFeatureSettings: '"cv11", "ss01"' },
          '@media (prefers-reduced-motion: reduce)': { '*': { animationDuration: '1ms !important', transitionDuration: '1ms !important' } },
          '@keyframes riseIn': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 44, borderRadius: 999, paddingInline: 18 } },
      },
      MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 600, height: 34 },
          sizeSmall: { height: 24, fontSize: '0.72rem' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: 16 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiAvatar: { styleOverrides: { rounded: { borderRadius: 12 } } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40 },
          indicator: { height: 3, borderRadius: 3 },
        },
      },
      MuiTab: { styleOverrides: { root: { minHeight: 40, fontWeight: 650, textTransform: 'none', fontSize: '0.95rem', paddingInline: 4, marginRight: 20, minWidth: 0 } } },
      MuiBottomNavigation: { styleOverrides: { root: { height: 64, backgroundColor: 'transparent' } } },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            minWidth: 72, paddingTop: 8, color: t.muted,
            '& .MuiSvgIcon-root': { padding: '3px 18px', borderRadius: 999, boxSizing: 'content-box', transition: 'background-color .2s' },
            '&.Mui-selected': { color: t.ink },
            '&.Mui-selected .MuiSvgIcon-root': { backgroundColor: alpha(t.accent, light ? 0.16 : 0.24), color: t.accent },
          },
          label: { fontSize: '0.72rem', fontWeight: 600, '&.Mui-selected': { fontSize: '0.72rem' } },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 24 } } },
      MuiLinearProgress: { styleOverrides: { root: { backgroundColor: alpha(t.ink, 0.08) } } },
      MuiSlider: {
        styleOverrides: {
          thumb: { width: 16, height: 16, boxShadow: 'none', '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 8px ${alpha(t.accent, 0.16)}` } },
          rail: { opacity: 1, backgroundColor: alpha(t.ink, 0.12) },
          track: { border: 'none' },
        },
      },
    },
  });
}
