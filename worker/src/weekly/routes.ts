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
  }, 200, { 'Cache-Control': 'no-store' });
}
