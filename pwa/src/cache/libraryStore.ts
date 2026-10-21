import { openDB, type IDBPDatabase } from 'idb';

export interface LibraryCacheStore {
  read(): Promise<unknown>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

let database: Promise<IDBPDatabase> | undefined;
function db() {
  database ??= openDB('discover-library-cache', 1, {
    upgrade(db) { db.createObjectStore('snapshots'); },
    blocking() { void database?.then(db => db.close()); database = undefined; },
  }).catch(error => { database = undefined; throw error; });
  return database;
}

/** Base indépendante : sa purge ne touche ni aux brouillons ni aux téléchargements. */
export const libraryCacheStore: LibraryCacheStore = {
  async read() { return (await db()).get('snapshots', 'library'); },
  async write(value) { await (await db()).put('snapshots', value, 'library'); },
  async clear() { await (await db()).delete('snapshots', 'library'); },
};
