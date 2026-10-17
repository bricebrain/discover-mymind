import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';

/** Ce que le lecteur sait jouer : pour l'instant l'audio original d'un épisode (les variantes arrivent au lot 7). */
export interface Track {
  targetType: 'episode' | 'variant';
  targetId: string;
  /** Référence de l'audio pour la progression (URL officielle telle qu'enregistrée, ou sha256). */
  audioRef: string;
  src: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  durationSec: number | null;
}

export const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25] as const;
export const SKIP_SECONDS = 10;
const SAVE_EVERY_MS = 15_000;
const RESUME_MIN_MS = 5_000;
const RATE_KEY = 'discover.playbackRate';

interface PlayerState {
  track: Track | null;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  rate: number;
  error: string | null;
  /** Durée réelle du fichier en cours, connue après le chargement (0 avant). */
  mediaDuration: number;
}

interface PlayerApi extends PlayerState {
  play: (track: Track) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer hors de PlayerProvider');
  return ctx;
}

/** Les éditeurs servent parfois l'audio en http : la PWA est en https, on demande la version https. */
export const secureSrc = (url: string) => (url.startsWith('http://') ? `https://${url.slice(7)}` : url);

function readRate(): number {
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    return (SPEEDS as readonly number[]).includes(r) ? r : 1;
  } catch {
    return 1;
  }
}

/**
 * Lecteur unique de l'app (§ 10) : un seul HTMLAudioElement, monté une fois au-dessus du routeur.
 * Changer d'écran, plier ou déplier le Fold7 ne l'interrompt pas. Media Session pour l'écran
 * verrouillé et les notifications d'Android ; progression enregistrée par audio.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<Track | null>(null);
  const lastSave = useRef(0);
  /** Faux tant que la reprise n'est pas appliquée : on n'écrase jamais une position avec 0 au chargement. */
  const resumed = useRef(false);
  const [state, setState] = useState<PlayerState>({
    track: null, playing: false, buffering: false, position: 0, duration: 0, rate: readRate(), error: null, mediaDuration: 0,
  });

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  /** Enregistre la position (keepalive : survit à la fermeture de l'app). */
  const save = useCallback((opts: { completed?: boolean; keepalive?: boolean } = {}) => {
    const a = audioRef.current;
    const t = trackRef.current;
    if (!a || !t || !resumed.current || !Number.isFinite(a.currentTime)) return;
    lastSave.current = Date.now();
    const body = {
      targetType: t.targetType, targetId: t.targetId, audioRef: t.audioRef,
      positionMs: Math.round(a.currentTime * 1000),
      durationMs: Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : null,
      completed: opts.completed ?? false,
    };
    if (opts.keepalive) {
      void fetch('/api/progress', {
        method: 'PUT', keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Discover-Client': '1' }, body: JSON.stringify(body),
      }).catch(() => {});
      return;
    }
    void api('/api/progress', { method: 'PUT', body }).catch(() => {});
  }, []);

  // Événements de l'élément audio → état React + Media Session.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const sync = () => setState((s) => ({
      ...s, playing: !a.paused, position: a.currentTime || 0,
      duration: Number.isFinite(a.duration) ? a.duration : s.duration,
      mediaDuration: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0,
    }));
    const onTime = () => {
      sync();
      if (!a.paused && Date.now() - lastSave.current > SAVE_EVERY_MS) save();
      if ('mediaSession' in navigator && Number.isFinite(a.duration) && a.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: a.playbackRate });
        } catch { /* positions incohérentes pendant un chargement */ }
      }
    };
    const onPause = () => {
      sync();
      save();
      // Les listes et le détail affichent « Reprendre à … » à jour.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['explorer'] });
        void qc.invalidateQueries({ queryKey: ['episode'] });
      }, 500);
    };
    const onEnded = () => {
      sync();
      save({ completed: true });
      void qc.invalidateQueries({ queryKey: ['explorer'] });
    };
    const onWaiting = () => setState((s) => ({ ...s, buffering: true }));
    const onPlaying = () => setState((s) => ({ ...s, buffering: false, error: null, playing: true }));
    const onError = () => setState((s) => ({ ...s, buffering: false, playing: false, error: 'Lecture impossible : le fichier audio est indisponible.' }));
    const onHide = () => {
      if (document.visibilityState === 'hidden' && trackRef.current) save({ keepalive: true });
    };

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', sync);
    a.addEventListener('play', sync);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', sync);
      a.removeEventListener('play', sync);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [qc, save]);

  const play = useCallback((track: Track) => {
    const a = audioRef.current;
    if (!a) return;
    const current = trackRef.current;
    if (current && current.targetType === track.targetType && current.targetId === track.targetId) {
      void a.play().catch(() => {});
      return;
    }
    if (current) save();
    resumed.current = false;
    trackRef.current = track;
    setState((s) => ({ ...s, track, playing: false, buffering: true, position: 0, duration: track.durationSec ?? 0, mediaDuration: 0, error: null }));
    a.src = track.src;
    a.playbackRate = readRate();
    a.defaultPlaybackRate = a.playbackRate;

    // Reprise au dernier point, si la position concerne bien ce fichier.
    const resume = api<{ progress: { positionMs: number; completed: boolean } | null }>(
      `/api/progress/${track.targetType}/${encodeURIComponent(track.targetId)}?audioRef=${encodeURIComponent(track.audioRef)}`,
    ).then((r) => r.progress).catch(() => null);
    void a.play().catch(() => setState((s) => ({ ...s, buffering: false })));
    void resume.then((p) => {
      if (trackRef.current !== track) return;
      if (!p || p.completed || p.positionMs < RESUME_MIN_MS) {
        resumed.current = true;
        return;
      }
      const seekTo = () => {
        a.currentTime = p.positionMs / 1000;
        resumed.current = true;
      };
      if (a.readyState >= 1) seekTo();
      else a.addEventListener('loadedmetadata', seekTo, { once: true });
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.subtitle,
        album: 'Discover',
        artwork: track.imageUrl ? [{ src: track.imageUrl, sizes: '512x512' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    }
  }, [save]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !trackRef.current) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const a = audioRef.current;
    if (!a || !trackRef.current) return;
    const max = Number.isFinite(a.duration) ? a.duration : seconds;
    a.currentTime = Math.max(0, Math.min(seconds, max));
    setState((s) => ({ ...s, position: a.currentTime }));
  }, []);

  const skip = useCallback((delta: number) => {
    const a = audioRef.current;
    if (a) seek(a.currentTime + delta);
  }, [seek]);

  const setRate = useCallback((rate: number) => {
    const a = audioRef.current;
    if (a) {
      a.playbackRate = rate;
      a.defaultPlaybackRate = rate;
    }
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch { /* stockage indisponible : la vitesse vaut pour cette session */ }
    setState((s) => ({ ...s, rate }));
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (trackRef.current) save();
    a.pause();
    a.removeAttribute('src');
    a.load();
    trackRef.current = null;
    setState((s) => ({ ...s, track: null, playing: false, buffering: false, position: 0, duration: 0, mediaDuration: 0, error: null }));
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }, [save]);

  // Déconnexion : le fournisseur est démonté, l'audio doit s'arrêter avec lui.
  useEffect(() => () => {
    audioRef.current?.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    document.documentElement.style.setProperty('--player-h', '0px');
  }, []);

  // Commandes de l'écran verrouillé, des notifications et des écouteurs.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void audioRef.current?.play()],
      ['pause', () => audioRef.current?.pause()],
      ['seekbackward', (d) => skip(-(d.seekOffset ?? SKIP_SECONDS))],
      ['seekforward', (d) => skip(d.seekOffset ?? SKIP_SECONDS)],
      ['seekto', (d) => d.seekTime !== undefined && seek(d.seekTime)],
      ['stop', () => stop()],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch { /* action non prise en charge par ce navigateur */ }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch { /* idem */ }
      }
    };
  }, [seek, skip, stop]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.track ? (state.playing ? 'playing' : 'paused') : 'none';
    // Hauteur du mini-lecteur, pour que les mises en page en tiennent compte.
    document.documentElement.style.setProperty('--player-h', state.track ? '72px' : '0px');
  }, [state.track, state.playing]);

  const value = useMemo<PlayerApi>(() => ({ ...state, play, toggle, seek, skip, setRate, stop }), [state, play, toggle, seek, skip, setRate, stop]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
