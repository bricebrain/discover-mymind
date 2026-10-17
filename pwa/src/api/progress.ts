import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Track } from '../player/types';

export interface ListeningProgress { positionMs: number; durationMs: number | null; completed: boolean }
export const progressKey = (track: Track) => ['progress', track.targetType, track.targetId, track.audioRef] as const;
export async function fetchProgress(track: Track): Promise<ListeningProgress | null> {
  const data = await api<{ progress: ListeningProgress | null }>(
    `/api/progress/${track.targetType}/${encodeURIComponent(track.targetId)}?audioRef=${encodeURIComponent(track.audioRef)}`,
  );
  return data.progress;
}
export function useListeningProgress(track: Track | null) {
  return useQuery({ queryKey: track ? progressKey(track) : ['progress','none'], enabled: !!track,
    queryFn: () => fetchProgress(track!), staleTime: 0 });
}
