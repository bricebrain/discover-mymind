import type { Env } from '../env';

/** Options d'une préparation automatique, dans l'ordre exact de `prepareOptions` (comparaison des demandes actives). */
const OPTIONS_SQL = `json_object(
  'coverage', CASE s.auto_preset WHEN 'condensed8' THEN 'condensed' ELSE 'essentials' END,
  'level', s.auto_level, 'style', 'narration',
  'targetMinutes', CASE s.auto_preset WHEN 'condensed8' THEN 8 ELSE 4 END,
  'faithful', json('false'), 'keepOriginalCopy', json('false'))`;

/**
 * Une seule demande par épisode, y compris après échec/annulation ; seul le dernier épisode est automatisé.
 * Formule et niveau viennent de l'émission (L'essentiel 4 min ou Condensé 8 min) ; l'interrupteur général coupe tout.
 */
export function automaticPreparation(env: Env,showId: string,now: number) {
  const at = new Date(now).toISOString();
  return env.DB.prepare(`INSERT OR IGNORE INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at)
    SELECT ?,'episode',e.id,${OPTIONS_SQL},?,?
    FROM episodes e JOIN shows s ON s.id=e.show_id
    WHERE s.id=? AND s.enabled=1 AND s.auto_prepare=1 AND e.content_id IS NULL
      AND COALESCE((SELECT value FROM app_settings WHERE key='auto_prepare_enabled'),'1')='1'
      AND e.id=(SELECT id FROM episodes WHERE show_id=s.id ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT 1)
      AND COALESCE(e.published_at,e.created_at)>=?
      AND NOT EXISTS (SELECT 1 FROM prepare_queue q WHERE q.kind='episode' AND q.ref=e.id)`)
    .bind(crypto.randomUUID(),at,at,showId,new Date(now-30*86_400_000).toISOString());
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
