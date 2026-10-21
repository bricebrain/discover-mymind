import type { QueryClient } from '@tanstack/react-query';
import type { PreparationChange } from './connection';

export function refreshPreparations(client: QueryClient, change: PreparationChange) {
  for (const key of ['queue','episode','explorer','dossier','dossiers']) void client.invalidateQueries({queryKey:[key]});
  for (const key of ['library','content']) {
    if (change.libraryChanged) void client.invalidateQueries({queryKey:[key]});
    // Une simple reconnexion ne rend pas périmé un cache encore frais.
    else if (change.reason !== 'changed') void client.refetchQueries({queryKey:[key],type:'active',stale:true});
  }
}
