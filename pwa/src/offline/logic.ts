import type { ContentDetail, ContentSegments, ContentVariant } from '../api/contents';
import { frenchCompanion } from '../content/variants';
import type { DownloadRecord, LocalProgress } from './types';

export const downloadKey = (contentId: string, variantKey: string) => `${contentId}:${variantKey}`;

export class OfflineError extends Error {
  constructor(readonly code: 'external' | 'storage' | 'integrity' | 'network' | 'busy' | 'incompatible', message: string) { super(message); }
}

/** Une version est téléchargeable si son audio est dans R2 (ou si elle est en texte seul). */
export function downloadable(variant: ContentVariant): boolean {
  return !variant.audio || variant.audio.source === 'r2';
}

/** Lit une réponse par morceaux en signalant la progression ; l'annulation passe par `signal` du fetch. */
export async function readWithProgress(response: Response, onProgress: (received: number, total: number | null) => void): Promise<Blob> {
  const header = Number(response.headers.get('Content-Length') ?? '');
  const total = Number.isSafeInteger(header) && header > 0 ? header : null;
  const type = response.headers.get('Content-Type') ?? 'application/octet-stream';
  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, total);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  if (total !== null && received !== total) throw new OfflineError('integrity', 'Téléchargement incomplet : la taille reçue ne correspond pas.');
  return new Blob(chunks as BlobPart[], { type });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Instantané conservé : la version téléchargée et son compagnon français (sans audio s'il n'est pas téléchargé). */
export function snapshotDetail(detail: ContentDetail, variant: ContentVariant): ContentDetail {
  const companion = frenchCompanion(variant, detail.variants);
  return { ...detail, variants: [variant, ...(companion ? [{ ...companion, audio: null }] : [])] };
}

/**
 * Détail reconstitué hors ligne pour un contenu : la publication la plus récente parmi les téléchargements complets,
 * ses versions téléchargées (avec l'audio local) puis les compagnons texte seul qui manquent.
 */
export function offlineDetailFrom(records: DownloadRecord[], contentId: string, audioUrl: (ref: string) => string | undefined): ContentDetail | null {
  const own = records.filter((r) => r.contentId === contentId && r.status === 'complete');
  if (!own.length) return null;
  const latest = own.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
  const same = own.filter((r) => r.publicationId === latest.publicationId);
  const variants: ContentVariant[] = [];
  for (const r of same) {
    const v = r.detail.variants.find((x) => x.key === r.variantKey);
    if (!v) continue;
    const local = r.audioRef ? audioUrl(r.audioRef) : undefined;
    variants.push(v.audio && local ? { ...v, audio: { ...v.audio, url: local } } : v);
  }
  for (const r of same) for (const v of r.detail.variants) {
    if (!variants.some((x) => x.key === v.key)) variants.push({ ...v, audio: null });
  }
  return { ...latest.detail, variants };
}

export function offlineSegmentsFrom(records: DownloadRecord[], publicationId: string, variantKey: string): ContentSegments | null {
  for (const r of records) {
    if (r.status !== 'complete' || r.publicationId !== publicationId) continue;
    if (r.variantKey === variantKey) return r.segments;
    if (r.companion?.variantKey === variantKey) return r.companion;
  }
  return null;
}

/** Au démarrage : un téléchargement resté « en cours » sans onglet actif est interrompu, jamais terminé. */
export function recoverStatus(record: DownloadRecord, heldElsewhere: boolean): DownloadRecord {
  if (record.status === 'downloading' && !heldElsewhere) {
    return { ...record, status: 'interrupted', error: 'Téléchargement interrompu avant la fin.' };
  }
  return record;
}

/** Un fichier local manquant ou de taille inattendue (éviction, stockage effacé) rend la version inutilisable. */
export function audioIntact(record: DownloadRecord, blob: Blob | undefined): boolean {
  return !record.audioRef || (!!blob && blob.size === record.audioBytes);
}

/**
 * Politique de synchronisation de la progression au retour du réseau : la position locale n'est envoyée que si le
 * serveur n'a pas d'écoute plus récente (autre appareil). Le dernier écrit gagne, horodatage à l'appui.
 */
export function shouldSendProgress(local: LocalProgress, server: { updatedAt?: string; audioRef?: string } | null): boolean {
  if (!server?.updatedAt) return true;
  const serverAt = Date.parse(server.updatedAt), localAt = Date.parse(local.recordedAt);
  return !Number.isFinite(serverAt) || !Number.isFinite(localAt) || localAt >= serverAt;
}

export const isNetworkFailure = (error: unknown) =>
  (typeof error === 'object' && error !== null && 'status' in error && (error as { status: unknown }).status === 0)
  || (typeof navigator !== 'undefined' && navigator.onLine === false);
