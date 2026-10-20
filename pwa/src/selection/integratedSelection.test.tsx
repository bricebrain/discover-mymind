// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ArticleSummary } from '../api/articles';
import { ArticleFeedCard } from '../explorer/FeedCards';
import { PreparedContents } from '../library/PreparedContents';
import { SelectionProvider, useSelection } from './useSelection';
import { SelectionBar } from './SelectionBar';
vi.mock('../player/PlayerProvider', () => ({ usePlayer: () => ({ track: null }) }));
vi.mock('../api/contents', () => ({ usePreparedContents: () => ({ isSuccess: true, data: { pages: [{ total: 1, contents: [
  { id: 'prepared', title: 'Version préparée', sourceType: 'youtube', originalLanguage: 'en', variantCount: 1 },
] }] } }) }));
const article: ArticleSummary = { id: 'a', title: 'Un article', publisher: 'Journal', language: 'en', contentId: null, sourceId: 's',
  summary: null, author: null, url: 'https://example.com', publishedAt: null, contentStatus: 'complete', reflectionId: null, contentLength: null };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function State() { const s = useSelection(); return <output>{s.items.map((i) => `${i.type}:${i.id}`).join(',')}</output>; }
it('active l’appui long sur le bouton principal réel d’Explorer, sans ouvrir l’article', () => {
  vi.useFakeTimers(); vi.stubGlobal('PointerEvent', MouseEvent);
  const open = vi.fn();
  render(<SelectionProvider><ArticleFeedCard article={article} index={0} onOpen={open} /><State /><SelectionBar onCreate={() => {}} /></SelectionProvider>);
  const title = screen.getByText('Un article');
  fireEvent.pointerDown(title, { button: 0, clientX: 20, clientY: 20 });
  act(() => vi.advanceTimersByTime(500)); fireEvent.pointerUp(title); fireEvent.click(title);
  expect(open).not.toHaveBeenCalled();
  expect(screen.getByText('article:a')).toBeDefined();
  expect(screen.getByRole('complementary').parentElement).toBe(document.body);
});
it('sélectionne un contenu préparé depuis la Bibliothèque sans naviguer ni supprimer', () => {
  const client = new QueryClient(); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter><SelectionProvider><PreparedContents /><State /></SelectionProvider></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Version préparée' }));
  fireEvent.click(screen.getByRole('link', { name: /Version préparée/ }));
  expect(screen.queryByText('content:prepared')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Version préparée' }));
  expect(screen.getByText('content:prepared')).toBeDefined();
});
