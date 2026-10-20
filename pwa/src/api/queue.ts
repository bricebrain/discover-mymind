import { api } from './client';
import type { PrepareOptions, QueueItem } from '../queue/types';

/** Identifiant d’épisode, de note My Mind ou de vidéo YouTube. */
export interface PrepTarget { kind: 'episode' | 'reflection' | 'youtube'; id: string }

export const queueApi = {
  list: (target?: PrepTarget) => api<{ items: QueueItem[]; atelierSeenAt?: string | null }>(`/api/queue${target ? `?${target.kind}=${encodeURIComponent(target.id)}` : ''}`),
  prepare: (target: PrepTarget,options: PrepareOptions) =>
    target.kind==='youtube'
      ? api<{ item: QueueItem }>('/api/sources/youtube',{method:'POST',body:{url:`https://www.youtube.com/watch?v=${target.id}`,options}})
      : api<{ item: QueueItem }>(`/api/${target.kind==='episode' ? 'episodes' : 'reflections'}/${target.id}/prepare`,{method:'POST',body:options}),
  cancel: (id: string) => api<void>(`/api/queue/${id}`,{method:'DELETE'}),
  retry: (id: string) => api<void>(`/api/queue/${id}/retry`,{method:'POST'}),
  remove: (id: string) => api<void>(`/api/queue/${id}/remove`,{method:'POST'}),
};
