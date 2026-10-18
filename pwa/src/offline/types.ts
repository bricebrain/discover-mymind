import type { ContentDetail, ContentSegments } from '../api/contents';

/**
 * `complete` seulement après écriture du fichier validé (taille + SHA-256) ; `interrupted` : fermeture ou
 * coupure pendant le téléchargement ; `broken` : fichier local absent ou altéré (éviction du navigateur).
 */
export type DownloadStatus = 'downloading' | 'complete' | 'interrupted' | 'failed' | 'broken';

export interface DownloadRecord {
  /** `<contentId>:<variantKey>` */
  key: string;
  contentId: string;
  variantKey: string;
  publicationId: string;
  title: string;
  label: string;
  /** SHA-256 de l'audio téléchargé ; null pour une version texte seul. */
  audioRef: string | null;
  audioBytes: number;
  textBytes: number;
  status: DownloadStatus;
  error?: string;
  /** Instantané du détail : le contenu, cette version et son compagnon français éventuel (texte seul). */
  detail: ContentDetail;
  segments: ContentSegments;
  companion?: ContentSegments;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressBody {
  targetType: 'episode' | 'variant';
  targetId: string;
  audioRef: string;
  positionMs: number;
  durationMs: number | null;
  completed: boolean;
}

/** Dernière position connue sur cet appareil ; `pending` tant que le Worker ne l'a pas reçue. */
export interface LocalProgress {
  key: string;
  body: ProgressBody;
  recordedAt: string;
  pending: boolean;
}

/** Accès au stockage local : IndexedDB dans l'app, mémoire dans les tests. */
export interface OfflineStore {
  listDownloads(): Promise<DownloadRecord[]>;
  getDownload(key: string): Promise<DownloadRecord | undefined>;
  putDownload(record: DownloadRecord): Promise<void>;
  /** Écrit le fichier et l'état `complete` dans une seule transaction. */
  putComplete(record: DownloadRecord, audio: Blob | null): Promise<void>;
  getAudio(key: string): Promise<Blob | undefined>;
  deleteDownload(key: string): Promise<void>;
  clear(): Promise<void>;
  getProgress(key: string): Promise<LocalProgress | undefined>;
  putProgress(record: LocalProgress): Promise<void>;
  listProgress(): Promise<LocalProgress[]>;
}
