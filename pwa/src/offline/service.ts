import type { ContentDetail, ContentSegments, ContentVariant } from '../api/contents';
import { frenchCompanion, variantLabel } from '../content/variants';
import {
  audioIntact, downloadable, downloadKey, OfflineError, offlineDetailFrom, offlineSegmentsFrom, readWithProgress,
  recoverStatus, sha256Hex, shouldSendProgress, snapshotDetail,
} from './logic';
import type { DownloadRecord, LocalProgress, OfflineStore, ProgressBody } from './types';

export interface ActiveDownload { received: number; total: number | null }
export interface OfflineSnapshot {
  ready: boolean;
  records: DownloadRecord[];
  active: Record<string, ActiveDownload>;
}

export interface OfflineDeps {
  store: OfflineStore;
  fetch: typeof fetch;
  now?: () => Date;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
  /** Verrou par version, partagé entre onglets (navigator.locks). */
  withLock?: <T>(name: string, run: (acquired: boolean) => Promise<T>) => Promise<T>;
  /** Noms des verrous tenus par d'autres onglets au démarrage. */
  heldLocks?: () => Promise<Set<string>>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persist?: () => Promise<boolean>;
  broadcast?: { post: () => void; listen: (onMessage: () => void) => void };
}

const LOCK_PREFIX = 'discover-download:';
const SAFETY_MARGIN = 1.1;

async function getJson<T>(f: typeof fetch, url: string, signal: AbortSignal): Promise<T> {
  let res: Response;
  try { res = await f(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new OfflineError('network', 'Connexion impossible pendant le téléchargement.'); }
  if (!res.ok) throw new OfflineError('network', `Téléchargement refusé (${res.status}).`);
  return res.json() as Promise<T>;
}

/**
 * Téléchargements hors ligne : métadonnées, transcription et audio d'une version, validés avant d'être marqués
 * complets. Le service garde en mémoire les URL `blob:` des audios locaux pour un accès synchrone du lecteur.
 */
export function createOfflineService(deps: OfflineDeps) {
  const store = deps.store;
  const now = deps.now ?? (() => new Date());
  const createUrl = deps.createUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = deps.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));
  const withLock = deps.withLock ?? (async <T>(_n: string, run: (acquired: boolean) => Promise<T>) => run(true));
  const urls = new Map<string, { key: string; url: string }>();
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<() => void>();
  let snapshot: OfflineSnapshot = { ready: false, records: [], active: {} };
  let initPromise: Promise<void> | null = null;
  let persisted = false;

  const emit = (patch: Partial<OfflineSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const l of listeners) l();
  };
  const setActive = (key: string, value: ActiveDownload | null) => {
    const active = { ...snapshot.active };
    if (value) active[key] = value; else delete active[key];
    emit({ active });
  };

  /** Recharge l'état depuis le stockage (démarrage, ou changement fait par un autre onglet). */
  async function reload(recover: boolean) {
    const held = recover && deps.heldLocks ? await deps.heldLocks() : new Set<string>();
    const records: DownloadRecord[] = [];
    const seen = new Set<string>();
    for (let r of await store.listDownloads()) {
      if (recover) {
        const next = recoverStatus(r, held.has(LOCK_PREFIX + r.key));
        if (next !== r) { r = next; await store.putDownload(r); }
      }
      if (r.status === 'complete' && r.audioRef) {
        seen.add(r.audioRef);
        if (!urls.has(r.audioRef)) {
          const blob = await store.getAudio(r.key);
          if (audioIntact(r, blob)) urls.set(r.audioRef, { key: r.key, url: createUrl(blob!) });
          else {
            r = { ...r, status: 'broken', error: 'Fichier audio local absent : retélécharger cette version.', updatedAt: now().toISOString() };
            await store.putDownload(r);
          }
        }
      }
      records.push(r);
    }
    for (const [ref, entry] of urls) if (!seen.has(ref)) { revokeUrl(entry.url); urls.delete(ref); }
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    emit({ ready: true, records });
  }

  function init() {
    initPromise ??= (async () => {
      try { await reload(true); }
      catch { emit({ ready: true, records: [] }); /* stockage indisponible : l'app reste utilisable en ligne */ }
      deps.broadcast?.listen(() => void reload(false).catch(() => {}));
    })();
    return initPromise;
  }

  const changed = async () => { await reload(false); deps.broadcast?.post(); };

  async function start(detail: ContentDetail, variant: ContentVariant): Promise<void> {
    await init();
    if (!downloadable(variant)) throw new OfflineError('external', 'Cette version est diffusée par l’éditeur : elle ne peut pas être téléchargée.');
    const key = downloadKey(detail.content.id, variant.key);
    if (controllers.has(key)) return;
    const controller = new AbortController();
    controllers.set(key, controller);
    setActive(key, { received: 0, total: null });
    try {
      await withLock(LOCK_PREFIX + key, async (acquired) => {
        if (!acquired) throw new OfflineError('busy', 'Ce téléchargement est déjà en cours dans une autre fenêtre.');
        const at = now().toISOString();
        const previous = await store.getDownload(key);
        const base: DownloadRecord = {
          key, contentId: detail.content.id, variantKey: variant.key, publicationId: detail.publicationId,
          title: detail.content.title, label: variantLabel(variant), audioRef: variant.audio?.sha256 ?? null,
          audioBytes: 0, textBytes: 0, status: 'downloading', detail: snapshotDetail(detail, variant),
          segments: { schemaVersion: 1, variantKey: variant.key, segments: [] }, createdAt: previous?.createdAt ?? at, updatedAt: at,
        };
        // Une ancienne version complète reste lisible tant que la nouvelle n'est pas validée.
        if (previous?.status !== 'complete') await store.putDownload(base);
        await changed();

        const segments = await getJson<ContentSegments>(deps.fetch, variant.segmentsUrl, controller.signal);
        if (segments.variantKey !== variant.key || !Array.isArray(segments.segments)) throw new OfflineError('incompatible', 'Transcription incompatible avec cette version.');
        const companionVariant = frenchCompanion(variant, detail.variants);
        const inline = segments.segments.length > 0 && segments.segments.every((s) => !!s.fr?.trim());
        const companion = companionVariant && !inline
          ? await getJson<ContentSegments>(deps.fetch, companionVariant.segmentsUrl, controller.signal).catch((e: Error) => { if (e.name === 'AbortError') throw e; return undefined; })
          : undefined;

        let audio: Blob | null = null;
        if (variant.audio) {
          if (!variant.audio.sha256) throw new OfflineError('integrity', 'Empreinte de l’audio absente : téléchargement impossible à vérifier.');
          let res: Response;
          try { res = await deps.fetch(variant.audio.url, { credentials: 'same-origin', signal: controller.signal }); }
          catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new OfflineError('network', 'Connexion impossible pendant le téléchargement.'); }
          if (!res.ok) throw new OfflineError('network', `Audio indisponible (${res.status}).`);
          const expected = Number(res.headers.get('Content-Length') ?? '');
          if (deps.estimate && Number.isFinite(expected) && expected > 0) {
            const { usage = 0, quota = Infinity } = await deps.estimate();
            if (quota - usage < expected * SAFETY_MARGIN) throw new OfflineError('storage', 'Espace insuffisant sur l’appareil pour cette version.');
          }
          if (!persisted && deps.persist) { persisted = true; await deps.persist().catch(() => false); }
          audio = await readWithProgress(res, (received, total) => setActive(key, { received, total }));
          if (await sha256Hex(audio) !== variant.audio.sha256) throw new OfflineError('integrity', 'Fichier audio altéré : empreinte différente de la version publiée.');
        }
        const textBytes = new Blob([JSON.stringify(segments), companion ? JSON.stringify(companion) : '']).size;
        const done: DownloadRecord = { ...base, segments, companion, audioBytes: audio?.size ?? 0, textBytes, status: 'complete', updatedAt: now().toISOString() };
        try { await store.putComplete(done, audio); }
        catch (e) {
          if ((e as Error).name === 'QuotaExceededError') throw new OfflineError('storage', 'Espace insuffisant sur l’appareil pour cette version.');
          throw e;
        }
        if (previous?.audioRef && previous.audioRef !== done.audioRef) {
          const old = urls.get(previous.audioRef);
          if (old) { revokeUrl(old.url); urls.delete(previous.audioRef); }
        }
      });
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError';
      const failure = error instanceof OfflineError ? error : new OfflineError('network', 'Téléchargement impossible.');
      // Le téléchargement d'un autre onglet n'est pas touché.
      if (failure.code !== 'busy' || aborted) {
        const current = await store.getDownload(key).catch(() => undefined);
        if (current && current.status !== 'complete') {
          // Annulation : rien n'est gardé. Échec : l'erreur reste visible avec « Réessayer ».
          if (aborted) await store.deleteDownload(key);
          else await store.putDownload({ ...current, status: 'failed', error: failure.message, updatedAt: now().toISOString() });
        }
      }
      if (!aborted) throw failure;
    } finally {
      controllers.delete(key);
      setActive(key, null);
      await changed().catch(() => {});
    }
  }

  function cancel(key: string) { controllers.get(key)?.abort(); }

  async function remove(key: string) {
    cancel(key);
    const record = snapshot.records.find((r) => r.key === key) ?? await store.getDownload(key);
    await store.deleteDownload(key);
    if (record?.audioRef) {
      const entry = urls.get(record.audioRef);
      if (entry?.key === key) { revokeUrl(entry.url); urls.delete(record.audioRef); }
    }
    await changed();
  }

  /** Déconnexion ou session refusée : tout ce qui a été téléchargé disparaît de l'appareil. */
  async function purge() {
    for (const c of controllers.values()) c.abort();
    for (const entry of urls.values()) revokeUrl(entry.url);
    urls.clear();
    await store.clear();
    await changed();
  }

  async function usage() {
    const own = snapshot.records.reduce((sum, r) => sum + r.audioBytes + r.textBytes, 0);
    const total = deps.estimate ? await deps.estimate().catch(() => ({} as { usage?: number; quota?: number })) : {};
    return { downloads: own, usage: total.usage ?? null, quota: total.quota ?? null };
  }

  // ── Progression d'écoute locale + file d'envoi ──────────────────────────────
  const progressKey = (b: Pick<ProgressBody, 'targetType' | 'targetId'>) => `${b.targetType}:${b.targetId}`;

  async function recordProgress(body: ProgressBody, pending: boolean) {
    const record: LocalProgress = { key: progressKey(body), body, recordedAt: now().toISOString(), pending };
    await store.putProgress(record).catch(() => {});
    return record;
  }
  async function markSent(record: LocalProgress) {
    const current = await store.getProgress(record.key).catch(() => undefined);
    if (current && current.recordedAt === record.recordedAt) await store.putProgress({ ...current, pending: false }).catch(() => {});
  }
  /** Copie la position du serveur sur l'appareil, sans jamais écraser une écoute locale. */
  async function seedProgress(body: ProgressBody, recordedAt: string) {
    if (await store.getProgress(progressKey(body)).catch(() => undefined)) return;
    await store.putProgress({ key: progressKey(body), body, recordedAt, pending: false }).catch(() => {});
  }
  async function localProgress(target: Pick<ProgressBody, 'targetType' | 'targetId' | 'audioRef'>) {
    const r = await store.getProgress(progressKey(target)).catch(() => undefined);
    return r && r.body.audioRef === target.audioRef ? r : null;
  }

  /** Envoie les positions en attente ; une écoute plus récente sur un autre appareil n'est pas écrasée. */
  async function flushProgress(send: (body: ProgressBody) => Promise<void>, server: (body: ProgressBody) => Promise<{ updatedAt?: string; audioRef?: string } | null>) {
    for (const record of await store.listProgress().catch(() => [] as LocalProgress[])) {
      if (!record.pending) continue;
      try {
        if (shouldSendProgress(record, await server(record.body))) await send(record.body);
        await markSent(record);
      } catch { return; /* toujours hors ligne : on réessaiera au prochain retour du réseau */ }
    }
  }

  return {
    init, start, cancel, remove, purge, usage,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    audioUrl: (audioRef: string) => urls.get(audioRef)?.url,
    async detail(contentId: string) { await init(); return offlineDetailFrom(snapshot.records, contentId, (ref) => urls.get(ref)?.url); },
    async segments(publicationId: string, variantKey: string) { await init(); return offlineSegmentsFrom(snapshot.records, publicationId, variantKey); },
    hasDownloads: () => snapshot.records.some((r) => r.status === 'complete'),
    recordProgress, markSent, seedProgress, localProgress, flushProgress,
  };
}

export type OfflineService = ReturnType<typeof createOfflineService>;
