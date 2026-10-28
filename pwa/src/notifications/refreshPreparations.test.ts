import { afterEach,expect,it,vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { LIBRARY_QUERY_POLICY } from '../cache/libraryPolicy';
import { refreshPreparations } from './refreshPreparations';

const clients:QueryClient[]=[];
afterEach(()=>{clients.splice(0).forEach(client=>client.clear());});
function setup() {
  const client=new QueryClient({defaultOptions:{queries:{...LIBRARY_QUERY_POLICY,retry:false,gcTime:Infinity}}});
  clients.push(client);
  const key=['library','prepared',{}];client.setQueryData(key,{pages:[]});
  const request=vi.fn(async()=>({pages:[]}));
  const observer=new QueryObserver(client,{queryKey:key,queryFn:request,...LIBRARY_QUERY_POLICY});
  return {client,key,request,unsubscribe:observer.subscribe(()=>{})};
}

it('une reconnexion et une étape intermédiaire ne relisent pas une bibliothèque fraîche',async()=>{
  const {client,key,request,unsubscribe}=setup();
  try {
    refreshPreparations(client,{reason:'connected',libraryChanged:false});
    refreshPreparations(client,{reason:'changed',libraryChanged:false});
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {unsubscribe();}
});

it('une publication terminée recharge la bibliothèque même si son cache est frais',async()=>{
  const {client,request,unsubscribe}=setup();
  try {
    refreshPreparations(client,{reason:'changed',libraryChanged:true});
    await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  } finally {unsubscribe();}
});

it('le retour dans l’app revalide une bibliothèque périmée',async()=>{
  const {client,key,request,unsubscribe}=setup();
  try {
    client.setQueryData(key,{pages:[]},{updatedAt:Date.now()-6*60_000});
    refreshPreparations(client,{reason:'resume',libraryChanged:false});
    await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  } finally {unsubscribe();}
});

it('la publication actualise aussi les articles visibles dans Explorer',()=>{
  const client=new QueryClient();clients.push(client);
  for (const key of [['article','research-id'],['articles',{}]]) client.setQueryData(key,{});
  refreshPreparations(client,{reason:'changed',libraryChanged:true});
  expect(client.getQueryState(['article','research-id'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['articles',{}])?.isInvalidated).toBe(true);
});
