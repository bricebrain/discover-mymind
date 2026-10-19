import { useSyncExternalStore } from 'react';

/** Vrai quand la requête média correspond (mise à jour au redimensionnement, ex. Fold7 plié ou déplié). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => { const m = window.matchMedia(query); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Mise en page déplié (Fold7 ouvert, tablette) : liste et détail côte à côte. */
export const WIDE = '(min-width:600px)';
