// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContentDetail, ContentVariant, GuideAnnotation } from '../api/contents';
import { AnnotatedText } from './AnnotatedText';
import { annotationPieces } from './annotations';

const save = vi.fn(async () => ({ pick: {}, alreadySaved: false }));
vi.mock('../vocabulary/api', () => ({ PICKS_KEY: ['picks'], saveWordPick: (...args: unknown[]) => save(...args as []) }));
const text = '🎧 Please hold on, then hold on.';
const start = Array.from(text.slice(0, text.lastIndexOf('hold on'))).length;
const annotation: GuideAnnotation = { segmentId: 's2', text: 'hold on', startChar: start, endChar: start + 7,
  meaning: 'Patiente.', note: 'Ici, on demande à la personne d’attendre.' };
const variant: ContentVariant = { key: 'en-source', kind: 'source', language: 'en', timingStatus: 'exact', segmentsUrl: '/s', audio: null };
const detail: ContentDetail = { content: { id: 'content', title: 'Test' }, publicationId: 'pub', variants: [variant] };
const mount = (onPlay?: () => void) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
  <span data-testid="original"><AnnotatedText detail={detail} variant={variant} segment={{ id: 's2', text, startMs: 1000, endMs: 3000 }}
    segmentIndex={7} annotations={[annotation]} onPlay={onPlay} /></span>
</QueryClientProvider>);
afterEach(() => { cleanup(); save.mockClear(); });

it('conserve tout le texte, même avec un emoji, et annote seulement la bonne occurrence', () => {
  mount();
  expect(screen.getByTestId('original').textContent).toBe(text);
  expect(screen.getAllByRole('button', { name: 'Expliquer « hold on »' })).toHaveLength(1);
  expect(screen.getByTestId('original').querySelector('button button')).toBeNull();
  const pieces = annotationPieces(text, [annotation]);
  expect(pieces[0]!.text).toBe('🎧 Please hold on, then ');
  expect(pieces.map((piece) => piece.text).join('')).toBe(text);
});

it('explique en français à la demande sans lancer l’audio et propose la réécoute', () => {
  const play = vi.fn(); mount(play);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Expliquer « hold on »' }));
  expect(screen.getByRole('dialog')).toBeDefined();
  expect(screen.getByText(annotation.meaning)).toBeDefined();
  expect(screen.getByText(annotation.note)).toBeDefined();
  expect(play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Écouter depuis cette phrase' }));
  expect(play).toHaveBeenCalledOnce();
});

it('ajoute l’expression à la révision avec son segment réel, même hors extrait', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Expliquer « hold on »' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter à ma révision' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ word: 'hold on', sentence: text,
    contentId: 'content', publicationId: 'pub', variantKey: 'en-source', segmentIndex: 7, language: 'en' }));
  await screen.findByText('Expression enregistrée dans ta révision.');
});

it('ignore une annotation invalide et conserve le texte lisible', () => {
  for (const note of [{ ...annotation, startChar: start + 1 }, { ...annotation, endChar: 999 }]) {
    expect(annotationPieces(text, [note])).toEqual([{ text }]);
  }
  expect(annotationPieces(text, [annotation, annotation]).filter((p) => p.annotation)).toHaveLength(1);
});
