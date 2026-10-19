import { variantTrack } from '../content/variants';
import { offline, type DownloadRecord } from '../offline';

import type { Track } from '../player/types';

type AudioUrl = (audioRef: string) => string | undefined;

/**
 * I5 — enchaînement « lire ensuite » : à la fin d'une version téléchargée, la suivante
 * de la liste des téléchargements prend le relais. Pas de boucle en fin de liste.
 */

/** Version téléchargée complète qui suit la piste courante, dans l'ordre de la liste des téléchargements. */
export function nextDownload(records: DownloadRecord[], currentKey: string | null, audioUrl: AudioUrl = offline.audioUrl): DownloadRecord | null {
  if (!currentKey) return null;
  const index = records.findIndex((r) => r.key === currentKey && r.status === 'complete' && !!r.audioRef);
  if (index === -1) return null;
  return records.slice(index + 1).find((r) => trackFromDownload(r, audioUrl) !== null) ?? null;
}

/** L'enchaînement ne joue que les fichiers locaux complets de la bonne empreinte. */
export function trackFromDownload(record: DownloadRecord, audioUrl: AudioUrl = offline.audioUrl): Track | null {
  if (record.status !== 'complete' || !record.audioRef) return null;
  const src = audioUrl(record.audioRef);
  const variant = record.detail.variants.find((v) => v.key === record.variantKey);
  if (!src || variant?.audio?.sha256 !== record.audioRef) return null;
  const track = variantTrack(record.detail, variant);
  return track ? { ...track, src } : null;
}

const AUTOPLAY_KEY = 'discover.autoplayNext';
let sessionAutoplay = false;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStorage = (): StorageLike | undefined => {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { return undefined; }
};

/** « Lire ensuite » persisté, désactivé par défaut : rien ne s'enchaîne sans un choix explicite. */
export function readAutoplayNext(storage: StorageLike | undefined = defaultStorage()): boolean {
  try { return storage ? storage.getItem(AUTOPLAY_KEY) === '1' : sessionAutoplay; } catch { return sessionAutoplay; }
}

export function writeAutoplayNext(on: boolean, storage: StorageLike | undefined = defaultStorage()): void {
  sessionAutoplay = on;
  try {
    if (on) storage?.setItem(AUTOPLAY_KEY, '1');
    else storage?.removeItem(AUTOPLAY_KEY);
  } catch { /* stockage indisponible : le choix vaut pour cette session */ }
}
