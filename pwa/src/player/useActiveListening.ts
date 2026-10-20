import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContentSegment } from '../api/contents';
import { ActiveListening, EMPTY_ACTIVE, type ActiveListeningApi } from './ActiveListening';
import type { AudioPosition } from './AudioPosition';
import type { Track } from './types';
export const listeningKey = (track: Track | null) => track?.segmentSource
  ? JSON.stringify([track.targetType, track.targetId, track.audioRef, track.segmentSource.publicationId, track.segmentSource.variant.key]) : null;
export function useActiveListening(audio: HTMLAudioElement | null, position: AudioPosition | null) {
  const [state, setState] = useState(EMPTY_ACTIVE);
  const engine = useMemo(() => audio && position ? new ActiveListening(audio, (seconds) => position.seek(seconds), setState) : null, [audio, position]);
  useEffect(() => engine?.attach(), [engine]);
  const repeat = useCallback(() => engine?.repeat(), [engine]);
  const slow = useCallback(() => engine?.slow(), [engine]);
  const setPauseAfterSegment = useCallback((value: boolean) => engine?.setPauseAfterSegment(value), [engine]);
  const configure = useCallback((target: string, segments: ContentSegment[], verified: boolean) => engine?.configure(target, segments, verified), [engine]);
  const setTrack = useCallback((track: Track | null) => engine?.setTrack(listeningKey(track)), [engine]);
  const beforeSeek = useCallback(() => engine?.beforeSeek(), [engine]);
  const cancelSlow = useCallback(() => engine?.cancelSlow(), [engine]);
  const controls: ActiveListeningApi = useMemo(() => ({ ...state, repeat, slow, setPauseAfterSegment }), [state, repeat, slow, setPauseAfterSegment]);
  return { controls, configure, setTrack, beforeSeek, cancelSlow };
}
