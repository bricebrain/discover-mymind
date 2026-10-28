// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { checkForAppUpdate, watchAppUpdates } from './updates';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

it('vérifie au démarrage, au retour au premier plan et au retour du réseau, sans appels rapprochés', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  const update = vi.fn(async () => ({} as ServiceWorkerRegistration));
  const stop = watchAppUpdates({ update } as unknown as ServiceWorkerRegistration);
  await tick();
  expect(update).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus'));
  await tick();
  expect(update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  window.dispatchEvent(new Event('focus'));
  await tick();
  expect(update).toHaveBeenCalledTimes(2);
  online.mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(60_000);
  window.dispatchEvent(new Event('focus'));
  expect(update).toHaveBeenCalledTimes(2);
  online.mockReturnValue(true);
  window.dispatchEvent(new Event('online'));
  await tick();
  expect(update).toHaveBeenCalledTimes(3);
  stop();
  await vi.advanceTimersByTimeAsync(600_000);
  window.dispatchEvent(new Event('focus'));
  expect(update).toHaveBeenCalledTimes(3);
});

it('ne vérifie pas en arrière-plan et reprend après un échec réseau', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  const update = vi.fn().mockRejectedValueOnce(new Error('hors ligne')).mockResolvedValue({});
  const stop = watchAppUpdates({ update } as unknown as ServiceWorkerRegistration);
  expect(update).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  expect(update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  window.dispatchEvent(new Event('focus'));
  await tick();
  expect(update).toHaveBeenCalledTimes(2);
  stop();
});

it('le contrôle manuel actualise uniquement le service worker et refuse le mode hors ligne', async () => {
  const update = vi.fn(async () => ({})), getRegistration = vi.fn(async () => ({ update }));
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: { getRegistration } });
  try {
    await checkForAppUpdate();
    expect(update).toHaveBeenCalledTimes(1);
    vi.stubGlobal('navigator', { onLine: false, serviceWorker: { getRegistration } });
    await expect(checkForAppUpdate()).rejects.toThrow('Reconnecte-toi');
    expect(getRegistration).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});
