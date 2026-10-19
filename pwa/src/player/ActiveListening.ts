import type { ContentSegment } from '../api/contents';
import { currentOrNextSegment, currentSegment, segmentBounds, type SegmentBounds } from './segmentBounds';

export interface ActiveListeningState { available: boolean; segmentIndex: number; pauseAfterSegment: boolean; slowing: boolean; pausedAtBoundary: boolean }
export interface ActiveListeningApi extends ActiveListeningState {
  repeat: () => void; slow: () => void; setPauseAfterSegment: (enabled: boolean) => void;
}
export const EMPTY_ACTIVE: ActiveListeningState = { available: false, segmentIndex: -1, pauseAfterSegment: false, slowing: false, pausedAtBoundary: false };
export type ActiveMedia = Pick<HTMLAudioElement, 'currentTime' | 'duration' | 'readyState' | 'paused' | 'seeking' | 'ended'
  | 'playbackRate' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'>;

/** Pilote le même élément audio que le lecteur ; aucun deuxième lecteur ni boucle de lecture implicite. */
export class ActiveListening {
  private target: string | null = null;
  private configured: string | null = null;
  private bounds: SegmentBounds[] = [];
  private armed: SegmentBounds | undefined;
  private held: SegmentBounds | undefined;
  private slowEnd: number | null = null;
  private baseRate = 1;
  private pauseAfter = false;
  private internalSeek = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: ActiveListeningState = EMPTY_ACTIVE;

  constructor(private media: ActiveMedia, private seek: (seconds: number) => void,
    private notify: (state: ActiveListeningState) => void) {}

  attach() {
    for (const event of ['timeupdate', 'loadedmetadata', 'play', 'playing', 'pause', 'ratechange']) this.media.addEventListener(event, this.tick);
    this.media.addEventListener('seeking', this.onSeeking);
    this.media.addEventListener('seeked', this.onSeeked);
    this.media.addEventListener('ended', this.onEnded);
    this.media.addEventListener('error', this.onError);
    return () => {
      this.clearTimer();
      for (const event of ['timeupdate', 'loadedmetadata', 'play', 'playing', 'pause', 'ratechange']) this.media.removeEventListener(event, this.tick);
      this.media.removeEventListener('seeking', this.onSeeking);
      this.media.removeEventListener('seeked', this.onSeeked);
      this.media.removeEventListener('ended', this.onEnded);
      this.media.removeEventListener('error', this.onError);
      this.cancelSlow(false);
    };
  }

  setTrack(target: string | null) {
    this.cancelSlow(false);
    this.clearTimer();
    this.target = target; this.configured = null; this.bounds = []; this.armed = undefined; this.held = undefined;
    this.internalSeek = false;
    this.emit();
  }

  configure(target: string, segments: ContentSegment[], verified: boolean) {
    if (target !== this.target) return;
    this.configured = verified ? target : null;
    this.bounds = verified ? segmentBounds(segments) : [];
    if (!this.bounds.length) this.cancelSlow(false);
    this.armed = undefined; this.held = undefined;
    this.tick();
  }

  setPauseAfterSegment = (enabled: boolean) => {
    this.pauseAfter = enabled;
    this.armed = undefined;
    this.tick();
  };

  cancelSlow = (emit = true) => {
    if (this.slowEnd !== null) {
      this.slowEnd = null;
      this.media.playbackRate = this.baseRate;
    }
    if (emit) this.emit();
  };

  beforeSeek = () => {
    this.cancelSlow(false);
    this.internalSeek = false; this.held = undefined; this.armed = undefined;
    this.clearTimer();
  };

  repeat = () => this.restart(false);
  slow = () => this.restart(true);

  private usable() {
    return this.configured !== null && this.configured === this.target && this.bounds.length > 0 && this.media.readyState >= 1
      && Number.isFinite(this.media.duration) && this.media.duration > 0 && this.bounds[this.bounds.length - 1]!.end <= this.media.duration + 0.05;
  }
  private segment() { return this.media.paused && this.held ? this.held : currentSegment(this.bounds, this.media.currentTime); }
  private restart(slow: boolean) {
    if (!this.usable()) return;
    const segment = this.segment();
    if (!segment) return;
    this.cancelSlow(false);
    this.held = undefined; this.armed = segment;
    if (slow) {
      this.baseRate = this.media.playbackRate;
      this.slowEnd = segment.end;
      this.media.playbackRate = 0.75;
    }
    this.internalSeek = true;
    this.seek(segment.start);
    void this.media.play().catch(() => {});
    this.emit();
  }

  private onSeeking = () => {
    if (!this.internalSeek) this.beforeSeek();
    this.clearTimer();
  };
  private onSeeked = () => {
    this.internalSeek = false;
    this.armed = undefined;
    this.tick();
  };
  private onEnded = () => {
    this.cancelSlow(false); this.clearTimer();
    if (this.pauseAfter && this.usable()) this.held = this.bounds[this.bounds.length - 1];
    this.emit();
  };
  private onError = () => { this.configured = null; this.cancelSlow(false); this.clearTimer(); this.emit(); };

  private tick = () => {
    this.clearTimer();
    if (!this.usable()) { this.emit(); return; }
    const position = this.media.currentTime;
    if (!this.media.paused && !this.media.seeking) {
      this.held = undefined;
      if (this.slowEnd !== null && (position >= this.slowEnd || position < (this.armed?.start ?? 0))) this.cancelSlow(false);
      if (this.pauseAfter && this.armed && position >= this.armed.end) {
        const ended = this.armed;
        this.held = ended; this.armed = undefined;
        this.cancelSlow(false);
        this.media.pause();
        this.internalSeek = true;
        this.seek(ended.end);
        this.emit();
        return;
      }
      this.armed = currentOrNextSegment(this.bounds, position);
      const end = Math.min(this.pauseAfter ? this.armed?.end ?? Infinity : Infinity, this.slowEnd ?? Infinity);
      if (Number.isFinite(end) && end > position) {
        // Le timer complète timeupdate ; on revérifie l'horloge média au réveil, y compris après mise en arrière-plan.
        this.timer = setTimeout(this.tick, Math.max(20, (end - position) / this.media.playbackRate * 1000));
      }
    }
    this.emit();
  };

  private clearTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private emit() {
    const available = this.usable();
    const next = { available, segmentIndex: available ? this.segment()?.index ?? -1 : -1,
      pauseAfterSegment: this.pauseAfter, slowing: this.slowEnd !== null, pausedAtBoundary: available && this.media.paused && !!this.held };
    if (Object.keys(next).some((key) => next[key as keyof ActiveListeningState] !== this.snapshot[key as keyof ActiveListeningState])) {
      this.snapshot = next;
      this.notify(next);
    }
  }
}
