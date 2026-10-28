import type { Env } from '../env';
import { retentionCutoff } from '../retention';

/** Options d'une préparation automatique, dans l'ordre exact de `prepareOptions` (comparaison des demandes actives). */
const OPTIONS_SQL = `json_object(
  'coverage', 'guided',
  'level', CASE s.auto_level WHEN 'original' THEN 'C1' ELSE s.auto_level END, 'style', 'narration',
  'targetMinutes', json('null'),
  'faithful', json('false'), 'keepOriginalCopy', json('false'))`;

/**
 * Une seule demande par vidéo, y compris après échec/annulation ou demande manuelle ; seule la dernière vidéo
 * de la chaîne est automatisée. Formule unique : original guidé, au niveau d'explication choisi pour la chaîne ;
 * l'interrupteur général coupe tout. La demande est identique à un envoi manuel (`kind` youtube, identifiant de vidéo).
 */
export function automaticPreparation(env: Env,showId: string,now: number) {
  const at = new Date(now).toISOString();
  return env.DB.prepare(`INSERT OR IGNORE INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at)
    SELECT ?,'youtube',e.video_id,${OPTIONS_SQL},?,?
    FROM episodes e JOIN shows s ON s.id=e.show_id
    WHERE s.id=? AND s.enabled=1 AND s.auto_prepare=1 AND s.source_type='youtube' AND e.video_id IS NOT NULL AND e.content_id IS NULL
      AND COALESCE((SELECT value FROM app_settings WHERE key='auto_prepare_enabled'),'1')='1'
      AND e.id=(SELECT id FROM episodes WHERE show_id=s.id ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT 1)
      AND e.published_at>=? AND e.published_at<=?
      AND e.published_at>=COALESCE((SELECT value FROM app_settings WHERE key='content_reset_at'),'0000')
      AND NOT EXISTS (SELECT 1 FROM prepare_queue q WHERE q.kind='youtube' AND q.ref=e.video_id)`)
    .bind(crypto.randomUUID(),at,at,showId,retentionCutoff(now),at);
}

/** Interrupteur général des préparations automatiques. */
export async function autoPrepareEnabled(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='auto_prepare_enabled'").first<{ value: string }>();
  return (row?.value ?? '1') === '1';
}
export async function setAutoPrepareEnabled(env: Env, enabled: boolean) {
  await env.DB.prepare("INSERT INTO app_settings (key,value) VALUES ('auto_prepare_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(enabled ? '1' : '0').run();
}
