// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuizCard } from './QuizCard';
import type { Quiz } from './api';
const target = { contentId: 'content/1', variantKey: 'en b1', publicationId: 'pub-1' };
let client: QueryClient;
const initial: Quiz = { publicationId: 'pub-1', variantKey: 'en b1', score: { correct: 0, answered: 0, total: 3 },
  questions: [0, 1, 2].map((i) => ({ questionIndex: i, question: `Question ${i}`, choices: ['First', 'Second', 'Third'], segmentIndex: i + 4, answer: null })) };
function mount() {
  const seek = vi.fn();
  render(<QueryClientProvider client={client}><QuizCard {...target} onSeek={seek} /></QueryClientProvider>);
  return seek;
}
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
describe('QuizCard', () => {
  it('envoie une réponse une seule fois, affiche correction, score et passage', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(initial)).mockResolvedValueOnce(Response.json({
      answer: { questionIndex: 0, choice: 1, correct: false, correctChoice: 0, explanation: 'Explanation' },
      score: { correct: 0, answered: 1, total: 3 },
    }));
    vi.stubGlobal('fetch', fetcher);
    const seek = mount();
    await screen.findByText('Question 0', { exact: false });
    const choice = screen.getAllByRole('button', { name: 'Second' })[0]!;
    fireEvent.click(choice); fireEvent.click(choice);
    await screen.findByText('Explanation');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toEqual(['/api/contents/content%2F1/variants/en%20b1/quiz/answers', expect.objectContaining({ body: JSON.stringify({ publicationId: 'pub-1', questionIndex: 0, choice: 1 }) })]);
    fireEvent.click(screen.getByRole('button', { name: 'Réécouter ce passage' }));
    expect(seek).toHaveBeenCalledWith(4);
    expect((screen.getByRole('button', { name: /✗ Second/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('restaure les réponses déjà enregistrées sans écriture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...initial, questions: [{ ...initial.questions[0], answer: { choice: 0, correct: true, correctChoice: 0, explanation: 'Already answered' } }] })));
    mount();
    await screen.findByText('Already answered');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('ne rend rien sans quiz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...initial, questions: [] })));
    mount();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('propose une reprise après une erreur réseau', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    mount();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined();
  });
});
