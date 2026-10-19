import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveProgress } from '../offline';
import { fetchProgress, progressKey } from '../api/progress';
import { AudioPosition } from './AudioPosition';
import { sameAudio, SPEEDS, SKIP_SECONDS, type Track, type PlayerApi, type PlayerState, type PlayOptions } from './types';
export { SPEEDS, SKIP_SECONDS, type Track } from './types';

const SAVE_EVERY_MS = 15_000;
const RATE_KEY = 'discover.playbackRate';

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
  /** Une version préchargée en pause n’est pas encore une écoute à sauvegarder. */
  const saveEnabled = useRef(false);
  /** La sauvegarde attend l’application de la reprise ou du passage demandé. */
  const positionControl = useRef<AudioPosition | null>(null);
  const [state, setState] = useState<PlayerState>({
    track: null, playing: false, buffering: false, position: 0, duration: 0, rate: readRate(), error: null, mediaDuration: 0, ended: false,
  });

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
    positionControl.current = new AudioPosition(audioRef.current);
  }

  /** Enregistre la position (keepalive : survit à la fermeture de l'app). */
  const save = useCallback((opts: { completed?: boolean; keepalive?: boolean } = {}) => {
    const a = audioRef.current;
    const t = trackRef.current;
    if (!a || !t || !saveEnabled.current || !positionControl.current?.ready || !Number.isFinite(a.currentTime)) return;
    lastSave.current = Date.now();
    const body = {
      targetType: t.targetType, targetId: t.targetId, audioRef: t.audioRef,
      positionMs: Math.round(a.currentTime * 1000),
      durationMs: Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : null,
      completed: opts.completed ?? a.ended,
    };
    // Gardée sur l'appareil puis envoyée ; hors ligne, elle attend le retour du réseau (chantier B).
    void saveProgress(body, opts.keepalive).then((sent) => {
      if (sent && !opts.keepalive) void qc.invalidateQueries({ queryKey: progressKey(t) });
    });
  }, [qc]);

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
      setState((s) => ({ ...s, ended: true }));
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
    const onSeeked = () => { sync(); if (a.paused) save(); };
    a.addEventListener('seeked', onSeeked);
    const onPlay = () => { saveEnabled.current = true; setState((s) => ({ ...s, ended: false })); sync(); };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', sync);
      a.removeEventListener('seeked', onSeeked);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [qc, save]);

  const play = useCallback((track: Track, options: PlayOptions = {}) => {
    const a = audioRef.current;
    if (!a) return;
    const current = trackRef.current;
    const unchanged = sameAudio(current, track);
    if (unchanged && current?.src === track.src) {
      if (options.positionSec !== undefined) positionControl.current?.seek(options.positionSec);
      if (options.autoplay === false) a.pause();
      else void a.play().catch(() => {});
      return;
    }
    const positionSec = options.positionSec ?? (unchanged ? a.currentTime : undefined);
    if (current) save();
    positionControl.current?.reset();
    a.pause();
    trackRef.current = track;
    saveEnabled.current = options.autoplay !== false;
    setState((s) => ({ ...s, track, playing: false, buffering: options.autoplay !== false, position: 0, duration: track.durationSec ?? 0, mediaDuration: 0, error: null, ended: false }));
    a.src = track.src;
    a.playbackRate = readRate();
    a.defaultPlaybackRate = a.playbackRate;

    positionControl.current?.restore(
      positionSec === undefined ? fetchProgress(track) : Promise.resolve(null), positionSec,
    );
    if (options.autoplay !== false) void a.play().catch(() => {
      if (sameAudio(trackRef.current, track)) setState((s) => ({ ...s, buffering: false }));
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

  const pause = useCallback(() => { audioRef.current?.pause(); }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !trackRef.current) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const a = audioRef.current;
    if (!a || !trackRef.current) return;
    saveEnabled.current = true;
    positionControl.current?.seek(seconds);
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
    positionControl.current?.reset();
    a.pause();
    a.removeAttribute('src');
    a.load();
    trackRef.current = null;
    saveEnabled.current = false;
    setState((s) => ({ ...s, track: null, playing: false, buffering: false, position: 0, duration: 0, mediaDuration: 0, error: null, ended: false }));
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }, [save]);

  // Déconnexion : le fournisseur est démonté, l'audio doit s'arrêter avec lui.
  useEffect(() => () => {
    save({ keepalive: true });
    positionControl.current?.reset();
    audioRef.current?.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    document.documentElement.style.setProperty('--player-h', '0px');
  }, [save]);

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

  const value = useMemo<PlayerApi>(() => ({ ...state, play, toggle, pause, seek, skip, setRate, stop }), [state, play, toggle, pause, seek, skip, setRate, stop]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
