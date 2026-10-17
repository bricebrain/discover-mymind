import type { PreparationEvents } from './events/hub';
export interface Env {
  DB: D1Database;
  EVENTS: DurableObjectNamespace<PreparationEvents>;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** Phrase secrète de connexion (24 caractères minimum). */
  APP_PASSPHRASE: string;
  /** Clé des empreintes de session ; la changer révoque toutes les sessions. */
  SESSION_EPOCH: string;
  /** Jeton Bearer de l'Atelier (32 caractères minimum). */
  ATELIER_TOKEN: string;
  /**
   * "true" : connexion désactivée (accès libre à /api, choix temporaire du propriétaire).
   * /atelier reste protégé par son jeton, et les contrôles CSRF restent actifs.
   */
  AUTH_DISABLED?: string;
  /** Délai fixe des réponses de connexion, en ms (défaut 400 ; 0 dans les tests). */
  LOGIN_DELAY_MS?: string;
}

export const MIN_PASSPHRASE_LENGTH = 24;
export const MIN_ATELIER_TOKEN_LENGTH = 32;

export const authDisabled = (env: Env) => env.AUTH_DISABLED === 'true';
