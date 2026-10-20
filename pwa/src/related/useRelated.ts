import { useQuery } from '@tanstack/react-query';
import { getRelated, type RelatedType } from './api';
export function useRelated(type: RelatedType, id: string) {
  return useQuery({ queryKey: ['related', type, id], queryFn: () => getRelated(type, id), enabled: !!id });
}
