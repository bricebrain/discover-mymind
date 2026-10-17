import type { ListeningProgress } from '../api/progress';

type Media = Pick<HTMLAudioElement, 'currentTime' | 'duration' | 'readyState' | 'addEventListener' | 'removeEventListener'>;

/** Annule les reprises asynchrones périmées et attend les métadonnées avant tout saut. */
export class AudioPosition {
  ready = false;
  private generation = 0;
  private pending: (() => void) | null = null;
  constructor(private readonly media: Media) {}

  reset() {
    this.generation++;
    this.ready = false;
    if (this.pending) this.media.removeEventListener('loadedmetadata', this.pending);
    this.pending = null;
  }

  restore(progress: Promise<ListeningProgress | null>, positionSec?: number) {
    this.reset();
    const generation = this.generation;
    if (positionSec !== undefined) { this.apply(positionSec, generation); return; }
    void progress.catch(() => null).then((p) => {
      if (this.generation !== generation) return;
      const seconds = p && !p.completed && p.positionMs >= 5000 ? p.positionMs / 1000 : 0;
      this.apply(seconds, generation);
    });
  }

  seek(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    this.reset();
    this.apply(seconds, this.generation);
  }

  private apply(seconds: number, generation: number) {
    if (!Number.isFinite(seconds)) seconds = 0;
    const seek = () => {
      if (this.generation !== generation) return;
      if (this.pending) this.media.removeEventListener('loadedmetadata', this.pending);
      this.pending = null;
      const duration = this.media.duration;
      this.media.currentTime = Math.max(0, Math.min(seconds, Number.isFinite(duration) ? duration : seconds));
      this.ready = true;
    };
    if (this.media.readyState >= 1) seek();
    else { this.pending = seek; this.media.addEventListener('loadedmetadata', seek); }
  }
}
