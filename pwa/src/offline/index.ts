import { useSyncExternalStore } from 'react';
import { api } from '../api/client';
import type { ContentDetail, ContentSegments, ContentVariant } from '../api/contents';
import { idbStore } from './db';
import { downloadKey } from './logic';
import { createOfflineService, type OfflineSnapshot } from './service';
import type { ProgressBody } from './types';
import { applyContentReset } from './reset';

export { downloadable, downloadKey, isNetworkFailure, OfflineError } from './logic';
export type { DownloadRecord, DownloadStatus } from './types';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('discover-offline') : null;
const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;

export const offline = createOfflineService({
  store: idbStore,
  fetch: (...args) => fetch(...args),
  withLock: locks
    ? (name, run) => locks.request(name, { ifAvailable: true }, (lock) => run(lock !== null)) as Promise<Awaited<ReturnType<typeof run>>>
    : undefined,
  heldLocks: locks ? async () => new Set(((await locks.query()).held ?? []).map((l) => l.name ?? '')) : undefined,
  estimate: typeof navigator !== 'undefined' && navigator.storage?.estimate ? () => navigator.storage.estimate() : undefined,
  persist: typeof navigator !== 'undefined' && navigator.storage?.persist ? () => navigator.storage.persist() : undefined,
  broadcast: channel ? { post: () => channel.postMessage('changed'), listen: (fn) => { channel.onmessage = fn; } } : undefined,
});

/** Démarrage : état des téléchargements, puis envoi des progressions faites hors ligne dès que le réseau revient. */
export function initOffline() {
  const flush = () => void offline.flushProgress(
    (body) => api('/api/progress', { method: 'PUT', body }),
    async (body) => (await api<{ progress: { updatedAt?: string; audioRef?: string } | null }>(
      `/api/progress/${body.targetType}/${encodeURIComponent(body.targetId)}`)).progress,
  );
  const reconnect = async () => {
    try {
      const { resetAt } = await api<{ resetAt: string | null }>('/api/settings/content-reset');
      if (typeof localStorage !== 'undefined') await applyContentReset(resetAt, () => offline.purge(), localStorage);
    } catch { return; /* Hors ligne : garder les téléchargements jusqu'au retour du serveur. */ }
    flush();
  };
  if (typeof window !== 'undefined') window.addEventListener('online', () => { void reconnect(); });
  return offline.init().then(async () => { if (typeof navigator === 'undefined' || navigator.onLine) await reconnect(); });
}

export function useOffline(): OfflineSnapshot {
  return useSyncExternalStore(offline.subscribe, offline.getSnapshot, offline.getSnapshot);
}

/** État d'une version pour le bouton de téléchargement. */
export function useDownload(detail: ContentDetail | undefined, variant: ContentVariant | undefined) {
  const state = useOffline();
  if (!detail || !variant) return null;
  const key = downloadKey(detail.content.id, variant.key);
  const record = state.records.find((r) => r.key === key);
  const active = state.active[key];
  // Le fichier local appartient à une publication antérieure : on le dit au lieu de changer l'audio en silence.
  const outdated = !!record && record.status === 'complete' && (record.publicationId !== detail.publicationId
    || (record.audioRef ?? null) !== (variant.audio?.sha256 ?? null));
  return { key, record, active, outdated };
}

/** Progression : position gardée sur l'appareil, envoyée au Worker dès que possible. */
export async function saveProgress(body: ProgressBody, keepalive = false) {
  const record = await offline.recordProgress(body, true);
  try {
    if (keepalive) {
      const res = await fetch('/api/progress', {
        method: 'PUT', keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Discover-Client': '1' }, body: JSON.stringify(body),
      });
      if (!res.ok) return false;
    } else await api('/api/progress', { method: 'PUT', body });
    await offline.markSent(record);
    return true;
  } catch { return false; }
}

/** Télécharge une version, puis garde sur l'appareil la position d'écoute déjà enregistrée sur le serveur. */
export async function startDownload(detail: ContentDetail, variant: ContentVariant) {
  await offline.start(detail, variant);
  if (!variant.audio?.sha256) return;
  const targetId = `${detail.content.id}:${variant.key}`;
  try {
    const { progress } = await api<{ progress: { positionMs: number; durationMs: number | null; completed: boolean; updatedAt: string } | null }>(
      `/api/progress/variant/${encodeURIComponent(targetId)}?audioRef=${encodeURIComponent(variant.audio.sha256)}`);
    if (progress) await offline.seedProgress({ targetType: 'variant', targetId, audioRef: variant.audio.sha256,
      positionMs: progress.positionMs, durationMs: progress.durationMs, completed: progress.completed }, progress.updatedAt);
  } catch { /* la position se retrouvera en ligne */ }
}

/** Supprime un téléchargement ; si son audio local est en lecture, le lecteur s'arrête d'abord. */
export async function removeDownload(key: string, player: { track: { src: string } | null; stop: () => void }) {
  const record = offline.getSnapshot().records.find((r) => r.key === key);
  const url = record?.audioRef ? offline.audioUrl(record.audioRef) : undefined;
  if (url && player.track?.src === url) player.stop();
  await offline.remove(key);
}

export async function cachedSegments(publicationId: string, variantKey: string): Promise<ContentSegments | null> {
  return offline.segments(publicationId, variantKey).catch(() => null);
}

export const formatBytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} Go` : n >= 1e6 ? `${Math.round(n / 1e6)} Mo` : n >= 1e3 ? `${Math.round(n / 1e3)} ko` : `${n} o`;
