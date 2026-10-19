import type { PaletteMode } from '@mui/material';

const STORAGE_KEY = 'discover.theme';

export function readThemePreference(): PaletteMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveThemePreference(mode: PaletteMode): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export function applyThemePreference(mode: PaletteMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0C0C0E' : '#FAFAF9');
}
