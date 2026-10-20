import { api } from '../api/client';
export type RelatedType = 'article' | 'episode' | 'reflection';
export interface RelatedItem { type: RelatedType; id: string; sourceKind: 'article' | 'podcast' | 'youtube' | 'note'; title: string; publisher: string; href: string }
export interface EventGroup { groupId: string; title: string; dossierCandidate: boolean; updatedAt: string; members: RelatedItem[] }
export interface RelatedResult { neighbors: RelatedItem[]; groups: EventGroup[] }
export const getRelated = (type: RelatedType, id: string) => api<RelatedResult>(`/api/related?type=${type}&id=${encodeURIComponent(id)}`);
export const getEventGroups = (since?: string) => api<{ groups: EventGroup[] }>(`/api/related/groups${since ? `?since=${encodeURIComponent(since)}` : ''}`);
