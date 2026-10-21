// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePreparation } from './usePreparation';
import { useDossier } from '../api/dossiers';

const state = vi.hoisted(() => ({ live: true }));
const list = vi.hoisted(() => vi.fn(async () => ({ items: [{ status: 'leased' }] })));
vi.mock('../notifications/PreparationEventsProvider', () => ({ usePreparationLive: () => state.live }));
vi.mock('../api/queue', () => ({ queueApi: { list } }));
vi.mock('../api/client', () => ({ api: vi.fn(async () => ({ dossier: {}, runs: [] })) }));

let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.useRealTimers(); vi.clearAllMocks(); state.live = true; });
function setup() {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('une préparation active ne relit pas D1 périodiquement lorsque les événements sont connectés', async () => {
  const wrapper = setup();
  renderHook(() => { usePreparation(); useDossier('dossier'); }, { wrapper });
  await act(() => vi.advanceTimersByTimeAsync(600_000));
  expect(list).toHaveBeenCalledTimes(1);
  const { api } = await import('../api/client');
  expect(api).toHaveBeenCalledTimes(1);
  await act(async () => { await client.invalidateQueries({ queryKey: ['queue'] }); });
  expect(list).toHaveBeenCalledTimes(2);
});

it('une déconnexion active un secours de cinq minutes, arrêté à la reconnexion', async () => {
  state.live = false;
  const wrapper = setup();
  const hook = renderHook(() => usePreparation(), { wrapper });
  await act(() => vi.advanceTimersByTimeAsync(299_000));
  expect(list).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(list).toHaveBeenCalledTimes(2);
  state.live = true;
  hook.rerender();
  await act(() => vi.advanceTimersByTimeAsync(600_000));
  expect(list).toHaveBeenCalledTimes(2);
});
