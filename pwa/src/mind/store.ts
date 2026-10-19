import { openDB, type IDBPDatabase } from 'idb';
import { api, ApiError } from '../api/client';
import { validArticleUrl } from './articleUrl';

/**
 * My Mind côté appareil (lot 4) : chaque note est d'abord écrite dans IndexedDB (rien ne se perd
 * si l'app est fermée en pleine frappe), puis envoyée au Worker. `baseUpdatedAt` est la version
 * serveur sur laquelle le brouillon s'appuie : le Worker répond 409 si quelqu'un a écrit entre-temps.
 */

export interface NoteLink {
  targetType: 'episode' | 'content';
  targetId: string;
  variantKey?: string | null;
  segmentId?: string | null;
  quote?: string | null;
  targetTitle?: string;
}

export interface Note {
  id: string;
  title: string | null;
  body: string;
  kind: string;
  tags: string[];
  links: NoteLink[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  englishContentId?: string | null;
  /** Réflexion personnelle ou article attribué à sa publication. */
  origin?: NoteOrigin;
  sourceName?: string | null;
  sourceUrl?: string | null;
  articleFetch?: ArticleFetchStatus | null;
}

export type NoteOrigin = 'personal' | 'article';
export type ArticleFetchStatus = 'pending' | 'complete' | 'partial' | 'unavailable' | 'skipped';

export interface Draft {
  id: string;
  title: string;
  body: string;
  links: NoteLink[];
  createdAt: string;
  /** Facultatifs : les brouillons enregistrés avant cette version n'en ont pas (= réflexion personnelle). */
  origin?: NoteOrigin;
  sourceName?: string;
  sourceUrl?: string;
  /** Version serveur de référence ; null = jamais envoyée. */
  baseUpdatedAt: string | null;
  /** Modifications locales pas encore acceptées par le serveur. */
  dirty: boolean;
  localUpdatedAt: number;
}

export interface NoteSummary {
  id: string;
  title: string | null;
  excerpt: string;
  updatedAt: string;
  firstLinkTitle: string | null;
  linkCount: number;
  origin?: NoteOrigin;
  sourceName?: string | null;
  /** Seulement sur cet appareil (pas encore synchronisée). */
  localOnly?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  dbPromise ??= openDB('discover', 1, {
    upgrade(d) {
      d.createObjectStore('drafts', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function getDraft(id: string): Promise<Draft | undefined> {
  try {
    return (await (await db()).get('drafts', id)) as Draft | undefined;
  } catch {
    return undefined;
  }
}

export async function putDraft(d: Draft): Promise<void> {
  try {
    await (await db()).put('drafts', d);
  } catch {
    /* stockage indisponible (navigation privée) : la note part directement au serveur */
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await (await db()).delete('drafts', id);
  } catch { /* idem */ }
}

export async function dirtyDrafts(): Promise<Draft[]> {
  try {
    return ((await (await db()).getAll('drafts')) as Draft[]).filter((d) => d.dirty);
  } catch {
    return [];
  }
}

export function newDraft(links: NoteLink[] = []): Draft {
  return {
    id: crypto.randomUUID(), title: '', body: '', links, createdAt: new Date().toISOString(),
    baseUpdatedAt: null, dirty: true, localUpdatedAt: Date.now(),
  };
}

export const draftFromNote = (n: Note): Draft => ({
  id: n.id, title: n.title ?? '', body: n.body, links: n.links, createdAt: n.createdAt,
  origin: n.origin ?? 'personal', sourceName: n.sourceName ?? '', sourceUrl: n.sourceUrl ?? '',
  baseUpdatedAt: n.updatedAt, dirty: false, localUpdatedAt: Date.now(),
});

export type PushResult =
  | { status: 'saved'; note: Note }
  | { status: 'conflict'; current: Note }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const linksPayload = (links: NoteLink[]) => links.map(({ targetType, targetId, variantKey, segmentId, quote }) => ({ targetType, targetId, variantKey, segmentId, quote }));

/** Envoie un brouillon : création (idempotente) ou modification avec contrôle de version. */
export async function pushDraft(d: Draft): Promise<PushResult> {
  const fields: Record<string, unknown> = { title: d.title.trim() || null, body: d.body, links: linksPayload(d.links),
    origin: d.origin ?? 'personal', sourceName: d.sourceName?.trim() || null, sourceUrl: d.sourceUrl?.trim() || null };
  // Un lien en cours de saisie n'est pas envoyé : le reste de la note se synchronise quand même.
  if (!validArticleUrl(d.sourceUrl ?? '')) delete fields.sourceUrl;
  try {
    if (d.baseUpdatedAt === null) {
      const r = await api<{ reflection: Note }>('/api/reflections', { method: 'POST', body: { id: d.id, createdAt: d.createdAt, ...fields } });
      // La note existait déjà (envoi précédent) avec un autre contenu : on la complète, on ne reprend jamais l'ancienne version.
      if (r.reflection.body !== d.body || (r.reflection.title ?? '') !== (fields.title ?? '')) {
        return pushDraft({ ...d, baseUpdatedAt: r.reflection.updatedAt });
      }
      return { status: 'saved', note: r.reflection };
    }
    const r = await api<{ reflection: Note }>(`/api/reflections/${d.id}`, { method: 'PATCH', body: { baseUpdatedAt: d.baseUpdatedAt, ...fields } });
    return { status: 'saved', note: r.reflection };
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) return { status: 'offline' };
    if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') {
      const current = await api<{ reflection: Note }>(`/api/reflections/${d.id}`).then((r) => r.reflection).catch(() => null);
      if (current) return { status: 'conflict', current };
    }
    return { status: 'error', message: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Au démarrage et au retour du réseau : renvoie les brouillons en attente. On ignore les notes vides
 * jamais envoyées et la note ouverte dans l'éditeur (`exceptId`), qui gère elle-même ses envois.
 */
export async function syncDirtyDrafts(exceptId?: string | null): Promise<number> {
  let synced = 0;
  for (const d of await dirtyDrafts()) {
    if (d.id === exceptId || (d.baseUpdatedAt === null && d.title.trim() === '' && d.body.trim() === '')) continue;
    const r = await pushDraft(d);
    if (r.status === 'offline') break;
    if (r.status === 'saved') {
      const latest = await getDraft(d.id);
      // Si l'utilisateur a encore tapé pendant l'envoi, on garde le brouillon « sale » sur la nouvelle base.
      await putDraft(latest && latest.localUpdatedAt > d.localUpdatedAt
        ? { ...latest, baseUpdatedAt: r.note.updatedAt }
        : { ...draftFromNote(r.note), localUpdatedAt: d.localUpdatedAt });
      synced++;
    }
  }
  return synced;
}
