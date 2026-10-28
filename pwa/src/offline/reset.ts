const RESET_KEY = 'discover:content-reset';

/** Seule la base des téléchargements est purgée ; My Mind et les préférences restent intacts. */
export async function applyContentReset(resetAt: string | null, purge: () => Promise<void>, storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (!resetAt || storage.getItem(RESET_KEY) === resetAt) return false;
  await purge();
  storage.setItem(RESET_KEY, resetAt);
  return true;
}
