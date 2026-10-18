import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { isNetworkFailure, offline } from '../offline';
import type { Track } from '../player/types';

export interface ListeningProgress { positionMs: number; durationMs: number | null; completed: boolean }
export const progressKey = (track: Track) => ['progress', track.targetType, track.targetId, track.audioRef] as const;
export async function fetchProgress(track: Track): Promise<ListeningProgress | null> {
  const local = await offline.localProgress(track).catch(() => null);
  try {
    const data = await api<{ progress: (ListeningProgress & { updatedAt?: string }) | null }>(
      `/api/progress/${track.targetType}/${encodeURIComponent(track.targetId)}?audioRef=${encodeURIComponent(track.audioRef)}`,
    );
    // Une écoute faite hors ligne et pas encore envoyée est plus récente que celle du serveur.
    if (local?.pending && (!data.progress?.updatedAt || local.recordedAt >= data.progress.updatedAt)) return local.body;
    return data.progress;
  } catch (error) {
    if (isNetworkFailure(error)) return local?.body ?? null;
    throw error;
  }
}
export function useListeningProgress(track: Track | null) {
  return useQuery({ queryKey: track ? progressKey(track) : ['progress','none'], enabled: !!track,
    queryFn: () => fetchProgress(track!), staleTime: 0 });
}
