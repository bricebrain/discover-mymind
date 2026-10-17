export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** Phrase secrète de connexion (24 caractères minimum). */
  APP_PASSPHRASE: string;
  /** Clé des empreintes de session ; la changer révoque toutes les sessions. */
  SESSION_EPOCH: string;
  /** Jeton Bearer de l'Atelier (32 caractères minimum). */
  ATELIER_TOKEN: string;
  /** Délai fixe des réponses de connexion, en ms (défaut 400 ; 0 dans les tests). */
  LOGIN_DELAY_MS?: string;
}

export const MIN_PASSPHRASE_LENGTH = 24;
export const MIN_ATELIER_TOKEN_LENGTH = 32;
