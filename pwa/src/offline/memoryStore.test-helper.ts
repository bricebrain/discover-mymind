import type { DownloadRecord, LocalProgress, OfflineStore } from './types';

/** Stockage en mémoire pour les tests ; `failNextComplete` simule un quota dépassé à l'écriture. */
export function memoryStore() {
  const downloads = new Map<string, DownloadRecord>();
  const audio = new Map<string, Blob>();
  const progress = new Map<string, LocalProgress>();
  const state = { failNextComplete: null as Error | null };
  const store: OfflineStore = {
    async listDownloads() { return [...downloads.values()].map((r) => structuredClone(r)); },
    async getDownload(key) { const r = downloads.get(key); return r && structuredClone(r); },
    async putDownload(r) { downloads.set(r.key, structuredClone(r)); },
    async putComplete(r, blob) {
      if (state.failNextComplete) { const e = state.failNextComplete; state.failNextComplete = null; throw e; }
      downloads.set(r.key, structuredClone(r));
      if (blob) audio.set(r.key, blob); else audio.delete(r.key);
    },
    async getAudio(key) { return audio.get(key); },
    async deleteDownload(key) { downloads.delete(key); audio.delete(key); },
    async clear() { downloads.clear(); audio.clear(); progress.clear(); },
    async getProgress(key) { const r = progress.get(key); return r && structuredClone(r); },
    async putProgress(r) { progress.set(r.key, structuredClone(r)); },
    async listProgress() { return [...progress.values()].map((r) => structuredClone(r)); },
  };
  return { store, downloads, audio, progress, state };
}
