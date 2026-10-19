import type { Env } from '../env';
import { weekKey } from './week';

/** À exécuter avant l'upsert de progression, dans le même batch atomique D1. */
export function listeningStatement(env: Env, type: string, id: string, audioRef: string, position: number, completed: number, now: Date) {
  return env.DB.prepare(`INSERT INTO weekly_listening (week,target_type,target_id,listened_ms,completed)
    VALUES (?,?,?,
      max(0, ? - coalesce((SELECT position_ms FROM listening_progress WHERE target_type=? AND target_id=? AND audio_ref=?),0)),
      CASE WHEN ?=1 AND NOT EXISTS (SELECT 1 FROM listening_progress WHERE target_type=? AND target_id=? AND audio_ref=? AND completed=1) THEN 1 ELSE 0 END)
    ON CONFLICT (week,target_type,target_id) DO UPDATE SET
      listened_ms=weekly_listening.listened_ms+excluded.listened_ms,
      completed=max(weekly_listening.completed,excluded.completed)`)
    .bind(weekKey(now), type, id, position, type, id, audioRef, completed, type, id, audioRef);
}

export function articleStatement(env: Env, id: string, action: 'read' | 'saved', now = new Date()) {
  return env.DB.prepare(`INSERT INTO weekly_articles (week,article_id,was_read,was_saved) VALUES (?,?,?,?)
    ON CONFLICT (week,article_id) DO UPDATE SET was_read=max(was_read,excluded.was_read),was_saved=max(was_saved,excluded.was_saved)`)
    .bind(weekKey(now), id, action === 'read' ? 1 : 0, action === 'saved' ? 1 : 0);
}
