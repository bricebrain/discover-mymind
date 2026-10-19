// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LevelFeedbackButtons } from './LevelFeedbackButtons';
import { levelFeedbackKey } from './keys';
const clients: QueryClient[] = [];
const props = { contentId: 'c', variantKey: 'en', publicationId: 'new', showId: 'show' };
const feedback = { ...props, level: 'B1', rating: 'too_easy' };
function mount(showId: string | undefined = 'show') {
  const client = new QueryClient(); clients.push(client);
  client.setQueryData(levelFeedbackKey('c', 'en'), { ...feedback, publicationId: 'old' });
  render(<QueryClientProvider client={client}><LevelFeedbackButtons {...props} showId={showId} /></QueryClientProvider>);
}
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); vi.unstubAllGlobals(); });
describe('retour de niveau', () => {
  it('ignore le retour d’une autre publication puis permet de le modifier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ feedback, levelSuggestion: { showId: 'show' } })));
    mount();
    expect(screen.getByRole('button', { name: 'Trop facile' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Trop facile' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trop facile' }).getAttribute('aria-pressed')).toBe('true'));
    expect(fetch).toHaveBeenCalledWith('/api/contents/c/variants/en/feedback', expect.objectContaining({ body: '{"publicationId":"new","rating":"too_easy"}' }));
    expect(screen.getByText(/Merci/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Trop dur' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('ne présente pas d’avis pour un contenu sans émission', () => {
    const client = new QueryClient(); clients.push(client);
    const view = render(<QueryClientProvider client={client}><LevelFeedbackButtons {...props} showId={undefined} /></QueryClientProvider>);
    expect(view.container.textContent).toBe('');
  });
});
