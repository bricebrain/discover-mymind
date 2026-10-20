import { useState } from 'react';
import { useDossierMutations, type Dossier } from '../api/dossiers';
import type { DossierRef } from '../api/dossiers';
import { useEventGroups } from './useEventGroups';
import { eventGroupsByDay } from './eventFeed';
const STORAGE = 'discover:hidden-event-groups';
function hiddenGroups(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(-200) : []; }
  catch { return []; }
}
export function useExplorerEvents() {
  const [since] = useState(() => new Date(Date.now() - 7 * 86400_000).toISOString());
  const query = useEventGroups(since);
  const [hidden, setHidden] = useState(hiddenGroups);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const { create } = useDossierMutations();
  const dismiss = (id: string) => setHidden((previous) => {
    const next = [...previous.filter((x) => x !== id), id].slice(-200);
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* Masquage de session si le stockage est bloqué. */ }
    return next;
  });
  function prepare(refs: DossierRef[]) {
    if (!create.isPending) create.mutate({ title: 'Nouveau dossier', sources: refs }, { onSuccess: ({ dossier }) => setDossier(dossier) });
  }
  return { query, byDay: eventGroupsByDay(query.data?.groups ?? [], hidden), dismiss, prepare, create, dossier, close: () => setDossier(null) };
}
