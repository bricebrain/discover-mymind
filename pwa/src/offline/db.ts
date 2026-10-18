import { openDB, type IDBPDatabase } from 'idb';
import type { DownloadRecord, LocalProgress, OfflineStore } from './types';

/** Base séparée de My Mind (`discover`) : purger les téléchargements ne touche jamais aux brouillons. */
const DB_NAME = 'discover-offline';
let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('downloads', { keyPath: 'key' });
      d.createObjectStore('audio');
      d.createObjectStore('progress', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export const idbStore: OfflineStore = {
  async listDownloads() { return (await db()).getAll('downloads') as Promise<DownloadRecord[]>; },
  async getDownload(key) { return (await db()).get('downloads', key) as Promise<DownloadRecord | undefined>; },
  async putDownload(record) { await (await db()).put('downloads', record); },
  async putComplete(record, audio) {
    const tx = (await db()).transaction(['downloads', 'audio'], 'readwrite');
    if (audio) void tx.objectStore('audio').put(audio, record.key);
    else void tx.objectStore('audio').delete(record.key);
    void tx.objectStore('downloads').put(record);
    await tx.done;
  },
  async getAudio(key) { return (await db()).get('audio', key) as Promise<Blob | undefined>; },
  async deleteDownload(key) {
    const tx = (await db()).transaction(['downloads', 'audio'], 'readwrite');
    void tx.objectStore('downloads').delete(key);
    void tx.objectStore('audio').delete(key);
    await tx.done;
  },
  async clear() {
    const tx = (await db()).transaction(['downloads', 'audio', 'progress'], 'readwrite');
    await Promise.all([tx.objectStore('downloads').clear(), tx.objectStore('audio').clear(), tx.objectStore('progress').clear(), tx.done]);
  },
  async getProgress(key) { return (await db()).get('progress', key) as Promise<LocalProgress | undefined>; },
  async putProgress(record) { await (await db()).put('progress', record); },
  async listProgress() { return (await db()).getAll('progress') as Promise<LocalProgress[]>; },
};
