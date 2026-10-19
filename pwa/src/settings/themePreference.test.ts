import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyThemePreference, readThemePreference, saveThemePreference } from './themePreference';

afterEach(() => vi.unstubAllGlobals());

describe('préférence de thème', () => {
  it('reste en clair sans préférence et restaure chaque choix enregistré', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    expect(readThemePreference()).toBe('light');
    expect(saveThemePreference('dark')).toBe(true);
    expect(readThemePreference()).toBe('dark');
    expect(saveThemePreference('light')).toBe(true);
    expect(readThemePreference()).toBe('light');
  });

  it('ignore une ancienne valeur invalide', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'system' });
    expect(readThemePreference()).toBe('light');
  });

  it('supporte le stockage bloqué et signale un échec de sauvegarde', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Stockage bloqué'); },
      setItem: () => { throw new Error('Stockage bloqué'); },
    });
    expect(readThemePreference()).toBe('light');
    expect(saveThemePreference('dark')).toBe(false);
  });

  it('synchronise les couleurs de l’interface et du navigateur dans les deux sens', () => {
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
    const setAttribute = vi.fn();
    vi.stubGlobal('document', { documentElement: root, querySelector: () => ({ setAttribute }) });
    applyThemePreference('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(setAttribute).toHaveBeenLastCalledWith('content', '#0C0C0E');
    applyThemePreference('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(setAttribute).toHaveBeenLastCalledWith('content', '#FAFAF9');
  });
});
