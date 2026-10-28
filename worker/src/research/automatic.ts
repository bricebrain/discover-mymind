import type { Env } from '../env';
import { HttpError } from '../http';
import { parseSafeUrl } from '../security/safeUrl';
import { recoverResearchPreparations } from './preparation';
import { publishDraft } from './publish';

export async function autoPublishEnabled(env: Env) {
  const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key='research_auto_publish'").first<{ value: string }>();
  return setting?.value === '1';
}

/** Réutilise la publication atomique existante : aucune génération ni dépense supplémentaire. */
export async function publishApprovedDrafts(env: Env): Promise<string[]> {
  await recoverResearchPreparations(env);
  if (!await autoPublishEnabled(env)) return [];
  const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key='research_publication_origin'").first<{ value: string }>();
  if (!setting) return [];
  const origin = parseSafeUrl(setting.value).origin;
  const rows = await env.DB.prepare(`SELECT id FROM research_drafts WHERE state='draft'
    AND json_extract(review_json,'$.verdict')='ok' ORDER BY created_at,id LIMIT 3`).all<{ id: string }>();
  const published: string[] = [];
  for (const { id } of rows.results) {
    // Une désactivation entre deux articles doit prendre effet immédiatement.
    if (!await autoPublishEnabled(env)) break;
    try { await publishDraft(env, id, origin); published.push(id); }
    catch (error) {
      if (!(error instanceof HttpError && ['draft_changed', 'review_required'].includes(error.code))) throw error;
    }
  }
  return published;
}
