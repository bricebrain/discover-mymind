import { useSearchParams } from 'react-router-dom';
import type { ContentDetail } from '../api/contents';
import { useListeningProgress } from '../api/progress';
import { usePlayer } from '../player/PlayerProvider';
import { sameAudio } from '../player/types';
import { timingVerified, variantTrack } from './variants';

export function useContentReader(detail: ContentDetail | undefined) {
  const [params, setParams] = useSearchParams();
  const player = usePlayer();
  const requested = params.get('v');
  const playingKey = detail?.variants.find((v) => player.track?.targetType === 'variant'
    && player.track.targetId === `${detail.content.id}:${v.key}`)?.key;
  // Par défaut, la version préparée (ce qu'on vient chercher), puis la traduction fidèle, puis l'original.
  const variant = detail?.variants.find((v) => v.key === (requested ?? playingKey))
    ?? detail?.variants.find((v) => v.kind === 'adaptation') ?? detail?.variants.find((v) => v.kind === 'faithful_translation')
    ?? detail?.variants.find((v) => v.kind === 'source') ?? detail?.variants[0];
  const track = detail && variant ? variantTrack(detail, variant) : null;
  const current = !!track && sameAudio(player.track, track);
  const progress = useListeningProgress(track);
  const verified = !!variant && timingVerified(variant, current ? player.mediaDuration : 0);

  const select = (key: string) => {
    const next = detail?.variants.find((v) => v.key === key);
    if (!detail || !next) return;
    const nextParams = new URLSearchParams(params); nextParams.set('v', key);
    setParams(nextParams, { replace: true });
    // Le lecteur suit le choix sans démarrer si l’écoute était en pause.
    if (player.track?.targetType === 'variant' && player.track.targetId.startsWith(`${detail.content.id}:`)) {
      const nextTrack = variantTrack(detail, next);
      if (nextTrack) player.play(nextTrack, { autoplay: player.playing || player.buffering }); else player.stop();
    }
  };
  const play = (positionSec?: number) => {
    if (!track) return;
    if (current && player.playing && positionSec === undefined) player.toggle();
    else player.play(track, positionSec === undefined ? undefined : { positionSec });
  };
  return { activeListening: current && verified ? player.activeListening : null, variant, current, select, play, progress,
    playing: current && player.playing, buffering: current && player.buffering,
    positionSec: current ? player.position : (progress.data?.completed ? 0 : (progress.data?.positionMs ?? 0) / 1000),
    // À la pause de fin, conserver le surlignage du passage écouté (bornes semi-ouvertes).
    activePositionMs: current && verified ? Math.max(0, player.position * 1000 - (player.activeListening.pausedAtBoundary ? 0.1 : 0)) : null,
    verified, unavailableVersion: !!requested && !detail?.variants.some((v) => v.key === requested) };
}
