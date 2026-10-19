export interface Track {
  targetType: 'episode' | 'variant';
  targetId: string;
  /** URL officielle ou SHA-256 : une nouvelle référence remet la progression à zéro. */
  audioRef: string;
  src: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  durationSec: number | null;
}
export interface PlayOptions { positionSec?: number; autoplay?: boolean }
export const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25] as const;
export const SKIP_SECONDS = 10;
export interface PlayerState {
  track: Track | null;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  rate: number;
  error: string | null;
  mediaDuration: number;
  /** Vrai quand la piste courante est arrivée au bout (minuterie « fin de l'épisode », enchaînement). */
  ended: boolean;
}
export interface PlayerApi extends PlayerState {
  play: (track: Track, options?: PlayOptions) => void;
  toggle: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
}
export function sameAudio(a: Track | null, b: Track): boolean {
  return !!a && a.targetType === b.targetType && a.targetId === b.targetId && a.audioRef === b.audioRef;
}
