// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, InfiniteQueryObserver } from '@tanstack/react-query';
import { clearLibraryCache, startLibraryPersistence } from './libraryPersistence';
import { LIBRARY_CACHE_MAX_AGE, LIBRARY_QUERY_POLICY } from './libraryPolicy';
import { librarySnapshot, readLibrarySnapshot } from './librarySnapshot';
import type { LibraryCacheStore } from './libraryStore';

const libraryKey = ['library','prepared',{}] as const;
const contentKey = ['content','one'] as const;
const detail = { content:{id:'one',title:'Contenu'},publicationId:'pub',variants:[] };
const page = {contents:[{id:'one',title:'Contenu'}],total:1,nextOffset:null};
const clients: QueryClient[] = [];
const stops: (()=>void)[] = [];
function client() {
  const c = new QueryClient({defaultOptions:{queries:{...LIBRARY_QUERY_POLICY,retry:false,gcTime:Infinity}}});
  clients.push(c); return c;
}
function memoryStore(initial?: unknown) {
  let value = initial;
  const store: LibraryCacheStore = {
    read:vi.fn(async()=>value), write:vi.fn(async next=>{value=next;}), clear:vi.fn(async()=>{value=undefined;}),
  };
  return store;
}
afterEach(()=>{for(const stop of stops.splice(0)) stop();for(const c of clients.splice(0)) c.clear();vi.useRealTimers();});

it('réutilise les détails après réouverture sans requête et sans renouveler leur date de fraîcheur',async()=>{
  const first = client(), old = Date.now()-60_000;
  first.setQueryData(contentKey,detail,{updatedAt:old});
  const store = memoryStore(librarySnapshot(first)), reopened=client();
  stops.push(await startLibraryPersistence(reopened,store));
  const request=vi.fn(async()=>detail);
  await reopened.fetchQuery({queryKey:contentKey,queryFn:request});
  expect(request).not.toHaveBeenCalled();
  expect(reopened.getQueryState(contentKey)?.dataUpdatedAt).toBe(old);
});

it('restaure les pages et poursuit la pagination au bon offset',async()=>{
  const first=client();
  first.setQueryData(libraryKey,{pages:[{...page,nextOffset:30}],pageParams:[0]});
  const second=client();stops.push(await startLibraryPersistence(second,memoryStore(librarySnapshot(first))));
  const request=vi.fn(async({pageParam}:{pageParam:number})=>({...page,contents:[],nextOffset:null,offset:pageParam}));
  const observer=new InfiniteQueryObserver(second,{queryKey:libraryKey,queryFn:request,initialPageParam:0,
    ...LIBRARY_QUERY_POLICY,getNextPageParam:last=>last.nextOffset});
  const unsubscribe=observer.subscribe(()=>{});
  try {
    expect(request).not.toHaveBeenCalled();
    await observer.fetchNextPage();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0].pageParam).toBe(30);
    expect(observer.getCurrentResult().data?.pages).toHaveLength(2);
  } finally {unsubscribe();}
});

it('revalide une donnée périmée et respecte une invalidation sauvegardée',async()=>{
  const first=client();first.setQueryData(contentKey,detail,{updatedAt:Date.now()-6*60_000});
  const second=client();stops.push(await startLibraryPersistence(second,memoryStore(librarySnapshot(first))));
  const request=vi.fn(async()=>({...detail,publicationId:'new'}));
  expect(second.getQueryData(contentKey)).toEqual(detail);
  await second.fetchQuery({queryKey:contentKey,queryFn:request});
  expect(request).toHaveBeenCalledTimes(1);
  await second.invalidateQueries({queryKey:contentKey});
  const third=client();stops.push(await startLibraryPersistence(third,memoryStore(librarySnapshot(second))));
  await third.fetchQuery({queryKey:contentKey,queryFn:request});
  expect(request).toHaveBeenCalledTimes(2);
});

it('conserve les textes immuables mais exclut sessions, notes, préparation et données trop anciennes',()=>{
  const c=client();
  c.setQueryData(['auth','session'],{secret:'NEVER_SAVE'});
  c.setQueryData(['queue'],{leaseToken:'NEVER_SAVE'});
  c.setQueryData(['reflections'],{body:'NEVER_SAVE'});
  c.setQueryData(contentKey,detail,{updatedAt:Date.now()-LIBRARY_CACHE_MAX_AGE-1});
  c.setQueryData(['content-segments','pub','en'],{schemaVersion:1,variantKey:'en',segments:[]});
  const saved=librarySnapshot(c);
  expect(saved).not.toContain('NEVER_SAVE');
  expect(readLibrarySnapshot(saved).queries.map(q=>q.queryKey)).toEqual([['content-segments','pub','en']]);
  expect(readLibrarySnapshot('invalid').queries).toEqual([]);
  expect(readLibrarySnapshot('{"version":99,"queries":[]}').queries).toEqual([]);
});

it('ne restaure pas une suppression ni une ancienne réponse en vol après purge',async()=>{
  vi.useFakeTimers();const c=client(),store=memoryStore();stops.push(await startLibraryPersistence(c,store));
  c.setQueryData(contentKey,detail);await vi.advanceTimersByTimeAsync(300);
  c.removeQueries({queryKey:contentKey});await vi.advanceTimersByTimeAsync(300);
  expect(readLibrarySnapshot(await store.read()).queries).toHaveLength(0);
  let finish!:(value:typeof detail)=>void;
  const pending=c.fetchQuery({queryKey:contentKey,queryFn:()=>new Promise<typeof detail>(resolve=>{finish=resolve;})}).catch(()=>{});
  await clearLibraryCache(c);
  finish(detail);await pending;await vi.advanceTimersByTimeAsync(300);
  expect(c.getQueryData(contentKey)).toBeUndefined();
  expect(readLibrarySnapshot(await store.read()).queries).toHaveLength(0);
});

it('continue à fonctionner lorsque le stockage est indisponible ou ne répond pas',async()=>{
  const c=client(), store=memoryStore();
  store.read=vi.fn(async()=>{throw new Error('storage denied');});
  store.write=vi.fn(async()=>{throw new Error('quota');});
  stops.push(await startLibraryPersistence(c,store));
  vi.useFakeTimers();c.setQueryData(contentKey,detail);await vi.advanceTimersByTimeAsync(300);
  expect(c.getQueryData(contentKey)).toEqual(detail);
  const blocked=memoryStore();let finish!:(value:unknown)=>void;
  blocked.read=()=>new Promise(resolve=>{finish=resolve;});
  const fresh=client(),starting=startLibraryPersistence(fresh,blocked);
  await vi.advanceTimersByTimeAsync(1000);stops.push(await starting);
  finish(librarySnapshot(c));await vi.advanceTimersByTimeAsync(1);
  expect(fresh.getQueryData(contentKey)).toBeUndefined();
});
