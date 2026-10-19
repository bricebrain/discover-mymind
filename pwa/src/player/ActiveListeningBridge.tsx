import { useEffect } from 'react';
import { useContentSegments } from '../api/contents';
import type { ContentSegment } from '../api/contents';
import { timingVerified } from '../content/variants';
import { usePlayer } from './PlayerProvider';
import { listeningKey } from './useActiveListening';
const EMPTY_SEGMENTS: ContentSegment[] = [];
/** Chargée pour la publication effectivement lue, même en dehors de sa page et depuis le cache hors ligne. */
export function ActiveListeningBridge() {
  const player = usePlayer();
  const source = player.track?.segmentSource;
  const query = useContentSegments(source?.publicationId ?? '', source?.variant);
  const key = listeningKey(player.track);
  const verified = !!source && timingVerified(source.variant, player.mediaDuration);
  const configure = player.configureActiveListening;
  useEffect(() => {
    if (key) configure(key, query.data?.segments ?? EMPTY_SEGMENTS, verified);
  }, [configure, key, query.data, verified, player.track]);
  return null;
}
