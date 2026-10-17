import { api } from './client';
import type { PrepareOptions, QueueItem } from '../queue/types';

/** Ce qu'on prépare : un épisode ou une note My Mind. */
export interface PrepTarget { kind: 'episode' | 'reflection'; id: string }

export const queueApi = {
  list: (target?: PrepTarget) => api<{ items: QueueItem[] }>(`/api/queue${target ? `?${target.kind}=${encodeURIComponent(target.id)}` : ''}`),
  prepare: (target: PrepTarget,options: PrepareOptions) =>
    api<{ item: QueueItem }>(`/api/${target.kind==='episode' ? 'episodes' : 'reflections'}/${target.id}/prepare`,{method:'POST',body:options}),
  cancel: (id: string) => api<void>(`/api/queue/${id}`,{method:'DELETE'}),
  retry: (id: string) => api<void>(`/api/queue/${id}/retry`,{method:'POST'}),
};
