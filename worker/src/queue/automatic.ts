import type { Env } from '../env';
import { prepareOptions } from './options';

/** Une seule demande par épisode, y compris après échec/annulation ; seul le dernier épisode est automatisé. */
export function automaticPreparation(env: Env,showId: string,now: number) {
  const condensed = JSON.stringify(prepareOptions({},'fr',3000));
  const full = JSON.stringify(prepareOptions({},'fr',null));
  const at = new Date(now).toISOString();
  return env.DB.prepare(`INSERT OR IGNORE INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at)
    SELECT ?,'episode',e.id,CASE WHEN e.duration_sec>1500 THEN ? ELSE ? END,?,?
    FROM episodes e JOIN shows s ON s.id=e.show_id
    WHERE s.id=? AND s.enabled=1 AND s.auto_prepare=1 AND e.content_id IS NULL
      AND e.id=(SELECT id FROM episodes WHERE show_id=s.id ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT 1)
      AND COALESCE(e.published_at,e.created_at)>=?
      AND NOT EXISTS (SELECT 1 FROM prepare_queue q WHERE q.kind='episode' AND q.ref=e.id)`)
    .bind(crypto.randomUUID(),condensed,full,at,at,showId,new Date(now-30*86_400_000).toISOString());
}
