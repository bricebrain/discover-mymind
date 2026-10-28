import type { Env } from './env';

export const ITEM_RETENTION_MS = 24 * 60 * 60_000;
export const retentionCutoff = (now: number) => new Date(now - ITEM_RETENTION_MS).toISOString();

/** Une remise à zéro ne doit pas réimporter les anciens éléments depuis les mêmes flux. */
export async function collectionCutoff(env: Env, now: number) {
  const reset = await env.DB.prepare("SELECT value FROM app_settings WHERE key='content_reset_at'").first<{ value: string }>();
  return Math.max(now - ITEM_RETENTION_MS, Date.parse(reset?.value ?? '') || 0);
}

/** Une date absente ou future ne permet pas de garantir la fraîcheur de la source. */
export function isRecentItem(publishedAt: string | null, now: number): boolean {
  if (!publishedAt) return false;
  const published = Date.parse(publishedAt);
  return Number.isFinite(published) && published >= now - ITEM_RETENTION_MS && published <= now;
}

export const ARTICLE_WAITING_FOR_DOSSIER = `EXISTS (SELECT 1 FROM dossier_runs r JOIN prepare_queue q ON q.kind='dossier' AND q.ref=r.id,
        json_each(r.sources_json) s WHERE q.status IN ('pending','leased')
        AND json_extract(s.value,'$.type')='article' AND json_extract(s.value,'$.ref')=articles.id
        AND json_extract(s.value,'$.contentStatus')<>'complete')`;

function expiredRequests(env: Env, now: number) {
  // Les demandes en attente liées à un abonnement expirent avant la suppression de leur source.
  // Un bail encore actif peut terminer son travail ; les sauvegardes et contenus préparés restent disponibles.
  return env.DB.prepare(`UPDATE prepare_queue SET status='cancelled', stage=NULL, lease_token=NULL,
      lease_owner=NULL, lease_expires_at=NULL, updated_at=?, error='Source expirée : publication de plus de 24 heures.'
      WHERE (status='pending' OR (status='leased' AND lease_expires_at<=?))
        AND kind IN ('episode','youtube')
        AND EXISTS (SELECT 1 FROM episodes e WHERE
          ((prepare_queue.kind='episode' AND e.id=prepare_queue.ref)
            OR (prepare_queue.kind='youtube' AND e.video_id=prepare_queue.ref))
          AND e.show_id IN (SELECT id FROM shows WHERE source_type='youtube')
          AND COALESCE(e.published_at,e.created_at)<?)
        AND NOT EXISTS (SELECT 1 FROM episodes e WHERE
          ((prepare_queue.kind='episode' AND e.id=prepare_queue.ref)
            OR (prepare_queue.kind='youtube' AND e.video_id=prepare_queue.ref))
          AND (e.state='saved' OR e.content_id IS NOT NULL))`).bind(new Date(now).toISOString(), new Date(now).toISOString(), retentionCutoff(now));
}

export async function expireCollectedRequests(env: Env, now = Date.now()) {
  await expiredRequests(env, now).run();
}

/** Purge indépendante du résultat du flux : s'exécute aussi sans nouveauté ou en cas d'erreur réseau. */
export async function cleanupCollectedItems(env: Env, now = Date.now()) {
  const cutoff = retentionCutoff(now);
  await env.DB.batch([
    expiredRequests(env, now),
    env.DB.prepare(`DELETE FROM episodes WHERE state<>'saved' AND content_id IS NULL
      AND show_id IN (SELECT id FROM shows WHERE source_type='youtube')
      AND COALESCE(published_at,created_at)<?
      AND NOT EXISTS (SELECT 1 FROM prepare_queue q WHERE
        ((q.kind='episode' AND q.ref=episodes.id) OR (q.kind='youtube' AND q.ref=episodes.video_id))
        AND q.status IN ('pending','leased'))`).bind(cutoff),
    env.DB.prepare(`DELETE FROM articles WHERE reflection_id IS NULL AND source_id<>'discover-research'
      AND COALESCE(published_at,created_at)<?
      AND NOT ${ARTICLE_WAITING_FOR_DOSSIER}`).bind(cutoff),
  ]);
}
