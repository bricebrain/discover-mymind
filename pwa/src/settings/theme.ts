import { useSyncExternalStore } from 'react';

/**
 * Thème choisi dans l'app : clair (blanc), sombre, ou automatique (suit le téléphone). Défaut : clair.
 * La clé est aussi lue par le script en ligne d'`index.html`, pour appliquer le thème avant le premier affichage.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export const THEME_KEY = 'discover:theme';
const COLORS: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#0d0e12' };

export function readTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'system' || v === 'light' ? v : 'light';
  } catch { return 'light'; }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
export const resolveTheme = (p: ThemePreference, dark = systemDark()): ResolvedTheme => (p === 'system' ? (dark ? 'dark' : 'light') : p);

export function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
}

const listeners = new Set<() => void>();
let current = typeof window === 'undefined' ? 'light' as ThemePreference : readTheme();

export function setTheme(p: ThemePreference) {
  current = p;
  try { localStorage.setItem(THEME_KEY, p); } catch { /* stockage indisponible : le choix vaut pour la session */ }
  applyTheme(resolveTheme(p));
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current === 'system') { applyTheme(resolveTheme('system')); listeners.forEach((l) => l()); }
  });
}

/** Préférence et thème effectif, mis à jour à chaque changement. */
export function useTheme() {
  const preference = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => 'light' as ThemePreference);
  return { preference, resolved: resolveTheme(preference), setTheme };
}
