import { api } from '../api/client';
export interface WordPickInput { word: string; sentence: string; contentId: string; publicationId: string; variantKey: string; segmentIndex: number; language: 'en' }
export type PickStatus = 'pending' | 'sent' | 'already_known' | 'failed';
export interface WordPick extends WordPickInput { id: string; seq: number; status: PickStatus; createdAt: string }
export const PICKS_KEY = ['vocabulary-picks'] as const;
export const getWordPicks = (after: number) => api<{ picks: WordPick[]; nextAfter: number | null }>(`/api/vocabulary/picks?after=${after}&limit=50`);
export async function saveWordPick(body: WordPickInput) {
  let alreadySaved = false;
  const result = await api<{ pick: WordPick }>('/api/vocabulary/picks', {
    method: 'POST', body, onResponse: (response) => { alreadySaved = response.status === 200; },
  });
  return { ...result, alreadySaved };
}
export const deleteWordPick = (id: string) => api<void>(`/api/vocabulary/picks/${encodeURIComponent(id)}`, { method: 'DELETE' });
