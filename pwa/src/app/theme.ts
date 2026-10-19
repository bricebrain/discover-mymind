import type { Category } from '../api/episodes';

/** Polices de la refonte (auto-hébergées, CSP font-src 'self') ; mêmes valeurs que les jetons de `styles/app.css`. */
export const fonts = {
  display: '"Instrument Serif", ui-serif, Georgia, serif',
  ui: '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  reading: '"Literata Variable", ui-serif, "New York", Charter, Georgia, serif',
} as const;

/** Couleur discrète par catégorie (pastille, puce). Thème clair uniquement. */
export const CATEGORY_COLORS: Record<Category, string> = {
  tech: '#2F5FB3', science: '#7A4FB0', economy: '#2E7D4F', news: '#B4442F', football: '#1F6E8C', stories: '#A8611A', humour: '#846344',
};

/** Le second paramètre (ancien mode clair/sombre) est ignoré : l'app est en thème clair uniquement. */
export const categoryColor = (c: Category, _mode?: 'light') => CATEGORY_COLORS[c];
