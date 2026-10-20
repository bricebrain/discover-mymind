import { useQuery } from '@tanstack/react-query';
import { getEventGroups } from './api';
export function useEventGroups(since?: string) {
  return useQuery({ queryKey: ['event-groups', since ?? null], queryFn: () => getEventGroups(since) });
}
