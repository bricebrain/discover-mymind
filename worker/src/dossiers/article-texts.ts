import type { Env } from '../env';
import { HttpError } from '../http';
import { checkSnapshotSize, type Snapshot } from './sources';

const waiting = (s: Snapshot) => s.type === 'article' && s.contentStatus !== 'complete';

/** La file de récupération existante accepte aussi les extraits non vides (feed/partial). */
export function articleTextRequests(env: Env, snapshots: Snapshot[], runId: string) {
  return snapshots.filter(waiting).map(s => env.DB.prepare(`UPDATE articles SET content_status='pending'
    WHERE id=? AND content_status IN ('none','feed','partial')
    AND EXISTS (SELECT 1 FROM dossier_runs WHERE id=?)`).bind(s.ref,runId));
}

/** Avant le bail : compléter une seule fois les instantanés, sans relire les autres sources. */
export async function resolveArticleTexts(env: Env) {
  const runs = await env.DB.prepare(`SELECT r.id,r.sources_json FROM dossier_runs r
    WHERE EXISTS (SELECT 1 FROM prepare_queue q WHERE q.kind='dossier' AND q.ref=r.id AND q.status='pending')
    AND EXISTS (SELECT 1 FROM json_each(r.sources_json) s
      WHERE json_extract(s.value,'$.type')='article' AND json_extract(s.value,'$.contentStatus')<>'complete')
    AND NOT EXISTS (SELECT 1 FROM json_each(r.sources_json) s JOIN articles a ON a.id=json_extract(s.value,'$.ref')
      WHERE json_extract(s.value,'$.type')='article' AND json_extract(s.value,'$.contentStatus')<>'complete'
      AND a.content_status IN ('none','feed','pending'))
    ORDER BY r.created_at,r.id LIMIT 10`).all<{id:string;sources_json:string}>();
  for (const run of runs.results) {
    const snapshots = JSON.parse(run.sources_json) as Snapshot[];
    let pending = false;
    try {
      for (const s of snapshots.filter(waiting)) {
        const a = await env.DB.prepare('SELECT content_status,content_text FROM articles WHERE id=?').bind(s.ref)
          .first<{content_status:string;content_text:string|null}>();
        if (!a || ['partial','unavailable'].includes(a.content_status)) {
          throw new HttpError(422,'article_unavailable','Texte complet de l’article inaccessible ou partiel. Retirer l’article et relancer le dossier.');
        }
        if (a.content_status !== 'complete') { pending = true; continue; }
        if (!a.content_text?.trim()) throw new HttpError(422,'source_missing','Le texte complet de l’article est vide.');
        s.text = a.content_text;
        s.contentStatus = 'complete';
      }
      if (pending) continue;
      checkSnapshotSize(snapshots);
      // Comparaison de l'ancien JSON : deux Ateliers ne peuvent pas remplacer une capture déjà complétée.
      await env.DB.prepare('UPDATE dossier_runs SET sources_json=? WHERE id=? AND sources_json=?')
        .bind(JSON.stringify(snapshots),run.id,run.sources_json).run();
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      await env.DB.prepare(`UPDATE prepare_queue SET status='failed',error=?,updated_at=?
        WHERE kind='dossier' AND ref=? AND status='pending' AND EXISTS
        (SELECT 1 FROM dossier_runs WHERE id=? AND sources_json=?)`)
        .bind(error.message,new Date().toISOString(),run.id,run.id,run.sources_json).run();
    }
  }
}

/** Condition SQL du bail : aucun article incomplet ne peut atteindre la chaîne IA. */
export const ARTICLE_TEXTS_READY = `NOT EXISTS (
 SELECT 1 FROM dossier_runs r,json_each(r.sources_json) s WHERE kind='dossier' AND r.id=ref
 AND json_extract(s.value,'$.type')='article' AND json_extract(s.value,'$.contentStatus')<>'complete')`;
