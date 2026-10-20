import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('thème', () => {
  it('résout automatique selon le téléphone et garde les choix explicites', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
