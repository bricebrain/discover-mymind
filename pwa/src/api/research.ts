import { api } from './client';

export interface ResearchArticle {
  title: string; summary: string; topicKey: string;
  sections: { heading: string; text: string; sourceIds: string[] }[];
  sources: { id: string; title: string; url: string }[];
  searchHtml?: string;
}
export interface ResearchReview { verdict: 'ok' | 'review' | 'rejected'; reasons: string[] }
export interface ResearchDraft {
  id: string; title: string; topic: string; state: 'draft' | 'published' | 'rejected'; createdAt: string; review: ResearchReview;
}
export interface ResearchStatus {
  enabled: boolean; autoPublish: boolean; configured: boolean; topics: Record<string, string>; weeklyDrafts: number;
  reservedMicros: number; limitMicros: number; reservePerRunMicros: number;
  runs: { id: string; day: string; topic: string; state: 'reserved' | 'running' | 'drafted' | 'skipped' | 'failed'; error: string | null; draftSlot: number }[];
}

export const researchApi = {
  status: () => api<ResearchStatus>('/api/research/status'),
  drafts: () => api<{ drafts: ResearchDraft[] }>('/api/research/drafts'),
  detail: (id: string) => api<{ draft: ResearchDraft & { article: ResearchArticle } }>(`/api/research/drafts/${id}`),
  enable: (enabled: boolean) => api('/api/research/settings', { method: 'PUT', body: { enabled } }),
  autoPublish: (autoPublish: boolean) => api('/api/research/settings', { method: 'PUT', body: { autoPublish } }),
  run: () => api('/api/research/run', { method: 'POST' }),
  publish: (id: string) => api<{ articleId: string }>(`/api/research/drafts/${id}/publish`, { method: 'POST' }),
  reject: (id: string) => api(`/api/research/drafts/${id}/reject`, { method: 'POST' }),
};
