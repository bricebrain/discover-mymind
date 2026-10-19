import { useEffect, useRef } from 'react';
import { useOffline } from '../offline';
import type { usePlayer } from '../player/PlayerProvider';
import { nextDownload, readAutoplayNext, trackFromDownload } from './nextUp';
import { returnPointStore } from './returnPoint';
import { endOfTrackAction, sleepElapsed, sleepStore, useSleep } from './sleep';

type Player = ReturnType<typeof usePlayer>;

/**
 * Automatismes d'écoute (I5), montés avec le mini-lecteur :
 * — minuterie 15/30/45 min : la lecture s'arrête à l'échéance, puis la minuterie s'efface ;
 * — « fin de l'épisode » : la minuterie s'arrête avec la piste et prime sur l'enchaînement ;
 * — enchaînement : à la fin d'une version téléchargée, la suivante de la liste si « lire ensuite » est actif.
 * La Media Session et l'enregistrement de progression restent gérés par le lecteur.
 */
export function useListeningAutomation(player: Player) {
  const sleep = useSleep();
  const { records } = useOffline();
  const playerRef = useRef(player);
  const recordsRef = useRef(records);
  playerRef.current = player;
  recordsRef.current = records;

  // Minuterie à durée : pause dès que l'échéance est atteinte (contrôle toutes les secondes).
  useEffect(() => {
    if (!sleep || sleep.endsAt === null) return;
    const check = () => {
      if (!sleepElapsed(sleepStore.getSnapshot(), Date.now())) return;
      playerRef.current.pause();
      sleepStore.cancel();
    };
    const id = window.setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    check();
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [sleep]);

  // Fin de piste, une seule fois par fin : « fin de l'épisode » bloque l'enchaînement.
  const endedHandled = useRef(false);
  useEffect(() => {
    const current = playerRef.current;
    if (!current.ended) { endedHandled.current = false; return; }
    if (endedHandled.current) return;
    endedHandled.current = true;
    const action = endOfTrackAction(sleepStore.getSnapshot(), readAutoplayNext(), Date.now());
    if (action === 'stop') { current.pause(); sleepStore.cancel(); return; }
    if (action !== 'next' || (current.activeListening.available && current.activeListening.pauseAfterSegment)) return;
    const key = current.track?.targetType === 'variant'
      && recordsRef.current.some((r) => r.key === current.track?.targetId && r.audioRef === current.track.audioRef)
      ? current.track.targetId : null;
    const next = nextDownload(recordsRef.current, key);
    const track = next ? trackFromDownload(next) : null;
    if (track) current.play(track);
  }, [player]);

  // Le lecteur vidé (bouton Fermer, fin de session) rend tout point de retour caduc.
  useEffect(() => {
    if (!player.track) { returnPointStore.clear(); sleepStore.cancel(); }
  }, [player.track]);
  useEffect(() => () => { returnPointStore.clear(); sleepStore.cancel(); }, []);
}
