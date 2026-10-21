import type { QueryKey } from '@tanstack/react-query';

export const LIBRARY_QUERY_POLICY = { staleTime: 5 * 60_000, gcTime: 60 * 60_000 };
export const LIBRARY_CACHE_MAX_AGE = 7 * 24 * 60 * 60_000;

/** Les sessions, notes, progressions et demandes de préparation restent hors de ce cache. */
export function isLibraryQuery(key: QueryKey): boolean {
  return (key[0] === 'library' && key[1] === 'prepared') ||
    (key[0] === 'content' && typeof key[1] === 'string') ||
    (key[0] === 'content-segments' && typeof key[1] === 'string' && typeof key[2] === 'string');
}
