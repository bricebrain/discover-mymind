import { api } from './client';
import type { PrepareOptions, QueueItem } from '../queue/types';

export const queueApi = {
  list: (episodeId?: string) => api<{ items: QueueItem[] }>(`/api/queue${episodeId ? `?episode=${encodeURIComponent(episodeId)}` : ''}`),
  prepare: (episodeId: string,options: PrepareOptions) => api<{ item: QueueItem }>(`/api/episodes/${episodeId}/prepare`,{method:'POST',body:options}),
  cancel: (id: string) => api<void>(`/api/queue/${id}`,{method:'DELETE'}),
  retry: (id: string) => api<void>(`/api/queue/${id}/retry`,{method:'POST'}),
};
