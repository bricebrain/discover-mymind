import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { PrepareOptions } from '../queue/types';

export type ArticleContentStatus = 'none' | 'feed' | 'pending' | 'complete' | 'partial' | 'unavailable';
export interface ArticleSummary {
  id: string; title: string; summary: string | null; author: string | null; url: string; publishedAt: string | null;
  contentStatus: ArticleContentStatus; reflectionId: string | null; contentLength: number | null;
  sourceId: string; publisher: string; language: 'fr' | 'en'; contentId: string | null;
}
export interface Article extends Omit<ArticleSummary, 'contentLength'> { contentText: string | null }
export interface ArticleSource { id: string; title: string; publisher: string; language: 'fr' | 'en' }
export interface ArticleFilters { source?: string; lang?: 'fr' | 'en' }

const query = (f: ArticleFilters, cursor?: string) => {
  const p = new URLSearchParams();
  if (f.source) p.set('source', f.source);
  if (f.lang) p.set('lang', f.lang);
  if (cursor) p.set('cursor', cursor);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function useArticles(filters: ArticleFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['articles', filters],
    queryFn: ({ pageParam }) => api<{ articles: ArticleSummary[]; nextCursor: string | null; sources: ArticleSource[] }>(`/api/articles${query(filters, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}

/** Détail ; suivi toutes les 4 s tant que l'Atelier récupère le texte. */
export function useArticle(id: string | null) {
  return useQuery({
    queryKey: ['article', id], enabled: !!id,
    queryFn: async () => (await api<{ article: Article }>(`/api/articles/${id}`)).article,
    refetchInterval: (q) => (q.state.data?.contentStatus === 'pending' ? 4000 : false),
  });
}

export function useArticleActions(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['article', id] });
    void qc.invalidateQueries({ queryKey: ['articles'] });
    void qc.invalidateQueries({ queryKey: ['reflections'] });
    void qc.invalidateQueries({ queryKey: ['queue'] });
  };
  return {
    fetchText: useMutation({ mutationFn: () => api<{ contentStatus: ArticleContentStatus }>(`/api/articles/${id}/fetch`, { method: 'POST' }), onSuccess: refresh }),
    toNote: useMutation({
      mutationFn: (prepare?: Partial<PrepareOptions>) => api<{ noteId: string }>(`/api/articles/${id}/note`, { method: 'POST', body: prepare ? { prepare } : {} }),
      onSuccess: refresh,
    }),
  };
}
