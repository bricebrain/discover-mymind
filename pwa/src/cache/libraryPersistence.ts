import { hydrate, type QueryClient } from '@tanstack/react-query';
import { isLibraryQuery } from './libraryPolicy';
import { librarySnapshot, readLibrarySnapshot } from './librarySnapshot';
import { libraryCacheStore, type LibraryCacheStore } from './libraryStore';

const controllers = new WeakMap<QueryClient, { clear(): Promise<void> }>();

async function boundedWait<T>(operation: Promise<T>, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation.catch(() => fallback),
      new Promise<T>(resolve => { timeout = setTimeout(() => resolve(fallback), 1000); })]);
  } finally { clearTimeout(timeout); }
}

/** Restauration avant montage des hooks : une donnée encore fraîche évite réellement l'appel réseau. */
export async function startLibraryPersistence(client: QueryClient, store: LibraryCacheStore = libraryCacheStore): Promise<() => void> {
  const saved = await boundedWait(store.read(), undefined);
  hydrate(client, readLibrarySnapshot(saved));

  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let writes = Promise.resolve();
  const flush = () => {
    clearTimeout(timer); timer = undefined;
    const snapshot = librarySnapshot(client), current = generation;
    writes = writes.then(async () => { if (current === generation) await store.write(snapshot); }).catch(() => {});
  };
  const controller = { clear: async () => {
    generation++;
    clearTimeout(timer); timer = undefined;
    await client.cancelQueries({ predicate: query => isLibraryQuery(query.queryKey) });
    client.removeQueries({ predicate: query => isLibraryQuery(query.queryKey) });
    writes = writes.then(() => store.clear()).catch(() => {});
    await boundedWait(writes, undefined);
  } };
  controllers.set(client, controller);
  const unsubscribe = client.getQueryCache().subscribe(event => {
    if (!isLibraryQuery(event.query.queryKey) || (event.type !== 'updated' && event.type !== 'removed')) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  });
  const onHidden = () => { if (document.visibilityState === 'hidden' && timer) flush(); };
  document.addEventListener('visibilitychange', onHidden);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onHidden);
    if (timer) flush();
    controllers.delete(client);
  };
}

/** Annulation et sérialisation empêchent une réponse en vol de ressusciter le cache après déconnexion. */
export async function clearLibraryCache(client: QueryClient): Promise<void> {
  const controller = controllers.get(client);
  if (controller) return controller.clear();
  await client.cancelQueries({ predicate: query => isLibraryQuery(query.queryKey) });
  client.removeQueries({ predicate: query => isLibraryQuery(query.queryKey) });
  await boundedWait(libraryCacheStore.clear(), undefined);
}
