import { useContentSegments, type ContentDetail, type ContentSegment, type ContentVariant } from '../api/contents';
import { canListenOriginal, citedSourceSegments, firstCitedMs, sourceVariantOf } from './sourceJump';
import { usePlayer } from '../player/PlayerProvider';
import { sameAudio } from '../player/types';
import { variantName, variantTrack } from '../content/variants';
import { returnPointStore } from './returnPoint';

export interface Original {
  /** Variante originale citée par la version affichée ; absente si on lit déjà l'original. */
  source: ContentVariant | undefined;
  /** Transcription de l'original (cache partagé avec la lecture : une seule requête par contenu). */
  doc: ReturnType<typeof useContentSegments>;
  /** Vrai si l'original a un audio rejoint à un instant fiable ; sinon, on en montrera le texte. */
  canListen: boolean;
  /** Vrai dès qu'il existe un original à citer : le menu du paragraphe ne s'affiche pas sinon. */
  available: boolean;
}

/** Original de la version affichée, sa transcription et la façon d'y accéder (I3). */
export function useOriginal(detail: ContentDetail, variant: ContentVariant): Original {
  const source = sourceVariantOf(detail, variant);
  const doc = useContentSegments(detail.publicationId, source, !!source);
  return { source, doc, canListen: canListenOriginal(source), available: !!source };
}

/** Résout les passages et mémorise la reprise avant de changer l'audio. */
export function useOriginalPassage(detail: ContentDetail, variant: ContentVariant, original: Original, segment?: ContentSegment) {
  const player = usePlayer();
  const cited = segment ? citedSourceSegments(segment, original.doc.data) : [];
  const startMs = firstCitedMs(cited);
  const listenable = original.canListen && startMs !== null;
  const jump = () => {
    const target = original.source ? variantTrack(detail, original.source) : null;
    if (!listenable || !target || startMs === null) return false;
    const adapted = variantTrack(detail, variant);
    const current = adapted && sameAudio(player.track, adapted);
    const positionSec = current ? player.position : undefined;
    const existing = returnPointStore.getSnapshot();
    // Un second saut depuis la même version ne doit pas perdre sa position de retour.
    const keep = positionSec === undefined && existing?.contentId === detail.content.id
      && existing.variantKey === variant.key && existing.track?.audioRef === adapted?.audioRef
      && existing.jumpedTo?.audioRef === target.audioRef;
    if (!keep) returnPointStore.set({
      contentId: detail.content.id, variantKey: variant.key, label: variantName(variant),
      title: detail.content.title, positionSec, track: current ? player.track : adapted,
      jumpedTo: { targetType: target.targetType, targetId: target.targetId, audioRef: target.audioRef },
    });
    player.play(target, { positionSec: startMs / 1000 });
    return true;
  };
  return { cited, listenable, jump };
}
