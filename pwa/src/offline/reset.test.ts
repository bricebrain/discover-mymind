import { expect, it, vi } from 'vitest';
import { applyContentReset } from './reset';

it('purge les téléchargements une seule fois par remise à zéro et conserve les autres réglages', async () => {
  const entries = new Map([['discover:theme', 'dark'], ['mind:draft', 'ma note']]);
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  const purge = vi.fn(async () => {});
  expect(await applyContentReset('2026-10-27T22:00:00.000Z', purge, storage)).toBe(true);
  expect(await applyContentReset('2026-10-27T22:00:00.000Z', purge, storage)).toBe(false);
  expect(purge).toHaveBeenCalledTimes(1);
  expect(entries.get('mind:draft')).toBe('ma note');
  expect(entries.get('discover:theme')).toBe('dark');
});

it('ne marque pas une purge qui a échoué comme appliquée', async () => {
  const storage = { getItem: () => null, setItem: vi.fn() };
  await expect(applyContentReset('2026-10-27', async () => { throw new Error('disque'); }, storage)).rejects.toThrow('disque');
  expect(storage.setItem).not.toHaveBeenCalled();
});
