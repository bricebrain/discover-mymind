import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WeeklyActivities } from './WeeklyActivities';
import { WeeklyMetrics } from './WeeklyMetrics';

describe('composants présentatifs du bilan', () => {
  it('distingue les données absentes des listes effectivement vides', () => {
    const missing = renderToStaticMarkup(<WeeklyActivities />);
    expect(missing).toContain('nécessitent un complément');
    expect(missing).not.toContain('Aucune activité');
    const empty = renderToStaticMarkup(<WeeklyActivities activities={{ listening: [], notes: [], articles: [], publications: [] }} />);
    expect(empty.match(/Aucune activité/g)).toHaveLength(4);
  });
  it('fournit les liens internes et échappe le texte des quatre catégories', () => {
    const html = renderToStaticMarkup(<MemoryRouter><WeeklyActivities activities={{
      listening: [{ targetType: 'variant', targetId: 'c:en-B1', title: '<script>', listenedMs: 60_000, completed: 1 }],
      notes: [{ id: 'n', title: 'Une note' }], articles: [{ id: 'a', title: 'Un article', wasRead: 1, wasSaved: 1 }],
      publications: [{ id: 'p', contentId: 'c', title: 'Une préparation' }],
    }} /></MemoryRouter>);
    for (const href of ['/library/c?v=en-B1', '/mind?n=n', '/?a=a', '/library/c']) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('1 min · terminé');
  });
  it('affiche les huit indicateurs et la comparaison même à zéro', () => {
    const metrics = { listenedMinutes: 1.25, completedContents: 0, notesCreated: 0, notesModified: 0,
      articlesRead: 0, articlesSaved: 0, linkedPassages: 0, publishedPreparations: 0 };
    const html = renderToStaticMarkup(<WeeklyMetrics metrics={metrics} delta={{ ...metrics, listenedMinutes: -2 }} previousWeek="2026-W42" />);
    expect(html.match(/<dt /g)).toHaveLength(8);
    expect(html).toContain('1,25');
    expect(html).toContain('−2');
    expect(html).toContain('2026-W42');
  });
});
