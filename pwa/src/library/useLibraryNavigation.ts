import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ContentSourceType } from '../api/contents';

export const LIBRARY_VIEWS = {
  all: 'Tout', youtube: 'YouTube', reflection: 'My Mind', dossier: 'Dossiers',
  queue: 'À préparer', saved: 'Sauvegardés', downloads: 'Téléchargements',
};
export type LibraryView = keyof typeof LIBRARY_VIEWS;

export function useLibraryNavigation() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('view') ?? 'all';
  const view: LibraryView = Object.hasOwn(LIBRARY_VIEWS, requested) ? requested as LibraryView : 'all';
  const search = params.get('q') ?? '';
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const select = (next: LibraryView) => {
    const updated = new URLSearchParams(params);
    updated.set('view', next); updated.delete('e');
    setParams(updated);
  };
  const setSearch = (value: string) => {
    const updated = new URLSearchParams(params);
    if (value) updated.set('q', value); else updated.delete('q');
    setParams(updated, { replace: true });
  };
  const type: ContentSourceType | undefined = ['youtube','reflection','dossier'].includes(view) ? view as ContentSourceType : undefined;
  return { view, select, search, setSearch, filters: { type, search: debouncedSearch } };
}
