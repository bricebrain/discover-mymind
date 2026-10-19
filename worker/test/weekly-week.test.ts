import { describe, expect, it } from 'vitest';
import { weekKey, weekRange } from '../src/weekly/week';

describe('semaines ISO en Europe/Paris', () => {
  it('convertit chaque borne indépendamment au changement heure été/hiver', () => {
    expect(weekRange('2026-W13')).toMatchObject({ start: '2026-03-22T23:00:00.000Z', end: '2026-03-29T22:00:00.000Z' });
    expect(weekRange('2026-W43')).toMatchObject({ start: '2026-10-18T22:00:00.000Z', end: '2026-10-25T23:00:00.000Z' });
    expect(weekRange('2026-W44').previousWeek).toBe('2026-W43');
  });
  it('gère les frontières de lundi et année ISO', () => {
    expect(weekKey(new Date('2026-10-18T21:59:59.999Z'))).toBe('2026-W42');
    expect(weekKey(new Date('2026-10-18T22:00:00.000Z'))).toBe('2026-W43');
    expect(weekRange('2026-W01')).toMatchObject({ start: '2025-12-28T23:00:00.000Z', previousWeek: '2025-W52' });
    expect(weekRange('2026-W53').previousWeek).toBe('2026-W52');
  });
  it.each(['', '2025-W53', '2026-W00', '2026-W54', '2026-W1', '2026-10-19', '1999-W52', '2100-W01', 'bad'])('refuse %s', value => {
    expect(() => weekRange(value)).toThrow(/Semaine ISO/);
  });
});
