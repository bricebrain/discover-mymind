// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useExplorerEvents } from './useExplorerEvents';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => { cleanup(); client.clear(); localStorage.clear(); vi.unstubAllGlobals(); });
it('masque un groupe durablement et crée le dossier sans lancer sa préparation', async () => {
  const members = ['a', 'b'].map((id) => ({ type: 'article', id, title: id, href: '/', publisher: id, sourceKind: 'article' }));
  const group = { groupId: 'group', title: 'Même événement', updatedAt: new Date().toISOString(), members, dossierCandidate: true };
  const fetcher = vi.fn().mockImplementation((_url: string, init: RequestInit) => Promise.resolve(Response.json(
    init.method === 'POST' ? { dossier: { id: 'dossier', title: 'Dossier', sources: members } } : { groups: [group] },
  )));
  vi.stubGlobal('fetch', fetcher);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(useExplorerEvents, { wrapper });
  await waitFor(() => expect(hook.result.current.byDay.size).toBe(1));
  act(() => hook.result.current.prepare([{ type: 'article', id: 'a' }, { type: 'article', id: 'b' }]));
  await waitFor(() => expect(hook.result.current.dossier?.id).toBe('dossier'));
  const writes = fetcher.mock.calls.filter(([, init]) => init.method === 'POST');
  expect(writes).toHaveLength(1); expect(writes[0]![0]).toBe('/api/dossiers');
  expect(JSON.parse(writes[0]![1].body)).toMatchObject({ sources: [{ type: 'article', id: 'a' }, { type: 'article', id: 'b' }] });
  act(() => hook.result.current.dismiss('group'));
  expect(hook.result.current.byDay.size).toBe(0);
  expect(localStorage.getItem('discover:hidden-event-groups')).toBe('["group"]');
});
