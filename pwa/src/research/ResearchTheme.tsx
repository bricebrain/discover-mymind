import { createTheme, ThemeProvider } from '@mui/material';
import type { ReactNode } from 'react';
import { useTheme } from '../settings/theme';

const themes = {
  light: createTheme({ palette: { primary: { main: '#03915A' }, background: { default: '#EEEEEE', paper: '#FFFFFF' } },
    typography: { fontFamily: 'Geist Variable, sans-serif' }, shape: { borderRadius: 12 } }),
  dark: createTheme({ palette: { mode: 'dark', primary: { main: '#62D9A2' }, background: { default: '#0D0E12', paper: '#17191F' } },
    typography: { fontFamily: 'Geist Variable, sans-serif' }, shape: { borderRadius: 12 } }),
};

export function ResearchTheme({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  return <ThemeProvider theme={themes[resolved]}>{children}</ThemeProvider>;
}
