import { dehydrate, hashKey, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { isLibraryQuery, LIBRARY_CACHE_MAX_AGE } from './libraryPolicy';

type SavedQuery = DehydratedState['queries'][number];
const MAX_BYTES = 4_000_000;
const MAX_QUERY_BYTES = 400_000;
const MAX_QUERIES = 100;

function validData(query: SavedQuery): boolean {
  const data = query.state?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return false;
  if (query.queryKey[0] === 'library') {
    const pages = data.pages;
    return Array.isArray(pages) && Array.isArray(data.pageParams) && pages.length === data.pageParams.length &&
      pages.every(page => page && Array.isArray(page.contents) && Number.isInteger(page.total) &&
        (page.nextOffset === null || Number.isInteger(page.nextOffset)));
  }
  if (query.queryKey[0] === 'content') {
    const content = data.content as Record<string, unknown> | undefined;
    return content?.id === query.queryKey[1] && typeof data.publicationId === 'string' && Array.isArray(data.variants);
  }
  return data.schemaVersion === 1 && data.variantKey === query.queryKey[2] && Array.isArray(data.segments);
}

function bounded(queries: SavedQuery[], now: number): SavedQuery[] {
  const kept: SavedQuery[] = [];
  let bytes = 0;
  for (const query of [...queries].sort((a,b) => (b.state?.dataUpdatedAt ?? 0) - (a.state?.dataUpdatedAt ?? 0))) {
    if (!Array.isArray(query.queryKey) || !isLibraryQuery(query.queryKey) || query.state?.status !== 'success' ||
      !Number.isFinite(query.state.dataUpdatedAt) || query.state.dataUpdatedAt > now ||
      now - query.state.dataUpdatedAt > LIBRARY_CACHE_MAX_AGE || !validData(query)) continue;
    // Ne restaure jamais un état « fetching » : la requête initiale n'existe plus après fermeture.
    const saved = { queryKey: query.queryKey, queryHash: hashKey(query.queryKey), dehydratedAt: now,
      state: { ...query.state, error: null, fetchFailureReason: null, fetchMeta: null, fetchStatus: 'idle' as const } };
    const size = new TextEncoder().encode(JSON.stringify(saved)).byteLength;
    if (size > MAX_QUERY_BYTES || bytes + size > MAX_BYTES || kept.length >= MAX_QUERIES) continue;
    bytes += size;
    kept.push(saved);
  }
  return kept;
}

export function librarySnapshot(client: QueryClient, now = Date.now()): string {
  const state = dehydrate(client, { shouldDehydrateMutation: () => false,
    shouldDehydrateQuery: query => isLibraryQuery(query.queryKey) && query.state.status === 'success' });
  return JSON.stringify({ version: 1, queries: bounded(state.queries, now) });
}

export function readLibrarySnapshot(value: unknown, now = Date.now()): DehydratedState {
  try {
    if (typeof value !== 'string' || value.length > MAX_BYTES + 100_000) return { queries: [], mutations: [] };
    const parsed = JSON.parse(value);
    return { queries: parsed?.version === 1 && Array.isArray(parsed.queries) ? bounded(parsed.queries, now) : [], mutations: [] };
  } catch { return { queries: [], mutations: [] }; }
}
