import type { Env } from '../env';
import { json } from '../http';
import { weekRange } from './week';
import { loadWeek, metrics, LIMITS } from './data';
import { weeklyMarkdown } from './markdown';

export async function weekly(req: Request, env: Env, markdown = false): Promise<Response> {
  const range = weekRange(new URL(req.url).searchParams.get('week'));
  const data = await loadWeek(env, range);
  if (markdown) return new Response(weeklyMarkdown(data, range), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="discover-weekly-${range.week}.md"`,
    },
  });
  const previousRange = weekRange(range.previousWeek, true);
  const current = metrics(data, range), previous = metrics(await loadWeek(env, previousRange), previousRange);
  const delta = Object.fromEntries(Object.entries(current).map(([key, value]) => [key,
    Math.round((value - previous[key as keyof typeof previous]) * 100) / 100]));
  return json({ ...range, metrics: current, previous: { week: range.previousWeek, metrics: previous }, delta,
    learnedWords: [], limits: LIMITS, listeningMethod: 'positive_position_deltas',
    // Listes de la semaine demandée seulement, sans le corps des notes (titre ou début du texte).
    activities: {
      listening: data.listening.map(({ targetType, targetId, title, listenedMs, completed }) => ({ targetType, targetId, title, listenedMs, completed })),
      notes: data.notes.map((n) => ({ id: n.id, title: n.title?.trim() || n.body.trim().split('\n')[0]!.slice(0, 80) || 'Note sans titre' })),
      articles: data.articles.map(({ id, title, wasRead, wasSaved }) => ({ id, title, wasRead, wasSaved })),
      publications: data.publications.map(({ id, contentId, title }) => ({ id, contentId, title })),
    },
  }, 200, { 'Cache-Control': 'no-store' });
}
