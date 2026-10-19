import { describe, expect, it } from 'vitest';
import { formatDelta, isEmptyWeek, listeningLink, selectedWeek, shiftWeek, weekKey, weekMonday } from './helpers';

const empty = {
  listenedMinutes: 0, completedContents: 0, notesCreated: 0, notesModified: 0,
  articlesRead: 0, articlesSaved: 0, linkedPassages: 0, publishedPreparations: 0,
};

describe('semaines ISO, dates civiles Europe/Paris comme le Worker', () => {
  it.each([
    ['2021-01-01T12:00:00Z', '2020-W53'], ['2021-01-03T23:00:00Z', '2021-W01'],
    ['2026-10-18T21:59:59Z', '2026-W42'], ['2026-10-18T22:00:00Z', '2026-W43'],
    ['2026-03-29T21:59:59Z', '2026-W13'], ['2026-03-29T22:00:00Z', '2026-W14'],
    ['2026-10-25T22:59:59Z', '2026-W43'], ['2026-10-25T23:00:00Z', '2026-W44'],
  ])('%s donne %s', (date, expected) => expect(weekKey(new Date(date))).toBe(expected));

  it('traverse les années et les changements d’heure sans décaler le lundi', () => {
    expect(shiftWeek('2020-W53', 1)).toBe('2021-W01');
    expect(shiftWeek('2021-W01', -1)).toBe('2020-W53');
    expect(shiftWeek('2026-W13', 1)).toBe('2026-W14');
    expect(shiftWeek('2026-W43', 1)).toBe('2026-W44');
    expect(weekMonday(shiftWeek('2000-W01', -1))).toBeNull();
  });

  it.each(['2021-W53', '2026-W00', '2026-W54', '1999-W52', '2100-W01', '2026-W1', 'oops'])('rejette %s', key => {
    expect(weekMonday(key)).toBeNull();
    expect(selectedWeek(key, '2026-W43')).toBe('2026-W43');
  });

  it('revient à la semaine courante pour un lien futur, conserve une semaine passée', () => {
    expect(selectedWeek('2026-W44', '2026-W43')).toBe('2026-W43');
    expect(selectedWeek(null, '2026-W43')).toBe('2026-W43');
    expect(selectedWeek('2020-W53', '2026-W43')).toBe('2020-W53');
  });
});

describe('présentation des activités', () => {
  it('formate des écarts absolus signés, sans pourcentage ni zéro négatif', () => {
    expect(formatDelta(1.25)).toBe('+1,25');
    expect(formatDelta(-2)).toBe('−2');
    expect(formatDelta(-0.001)).toBe('Sans changement');
    expect(formatDelta(0)).toBe('Sans changement');
  });
  it('reconnaît une semaine vide sans confondre absence de liste et absence d’activité', () => {
    expect(isEmptyWeek(empty)).toBe(true);
    expect(isEmptyWeek({ ...empty, notesModified: 1 })).toBe(false);
  });
  it('ouvre le bon épisode ou la bonne variante et encode les identifiants', () => {
    expect(listeningLink('episode', 'e/1')).toBe('/?e=e%2F1');
    expect(listeningLink('variant', 'c/1:en:B1')).toBe('/library/c%2F1?v=en%3AB1');
    expect(listeningLink('variant', 'missing')).toBeNull();
    expect(listeningLink('variant', 'c:')).toBeNull();
  });
});
