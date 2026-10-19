import type { Episode } from '../api/episodes';
import { secureSrc, type Track } from './PlayerProvider';

export const trackOf = (e: Episode): Track => ({
  targetType: 'episode', targetId: e.id, audioRef: e.audioUrl, src: secureSrc(e.audioUrl),
  title: e.title, subtitle: e.showTitle, imageUrl: e.imageUrl, durationSec: e.durationSec,
});
