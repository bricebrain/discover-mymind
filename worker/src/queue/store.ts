import type { Env } from '../env';
import type { PrepareOptions } from './options';

export interface QueueRow {
  id: string; kind: 'episode' | 'reflection' | 'youtube' | 'dossier'; ref: string; options_json: string;
  status: 'pending' | 'leased' | 'done' | 'failed' | 'cancelled'; stage: string | null;
  lease_token: string | null; lease_owner: string | null; lease_expires_at: string | null;
  attempts: number; max_attempts: number; content_id: string | null; error: string | null;
  created_at: string; updated_at: string; title?: string;
  executor: 'mac'|'cloud';
  started_at?: string | null; stage_started_at?: string | null;
}
export function queueOut(row: QueueRow) {
  return { id: row.id, kind: row.kind, ref: row.ref, executor:row.executor, title: row.title ?? row.ref,
    options: JSON.parse(row.options_json) as PrepareOptions, status: row.status, stage: row.stage,
    attempts: row.attempts, maxAttempts: row.max_attempts, contentId: row.content_id,
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at, leaseExpiresAt: row.lease_expires_at };
}
export const QUEUE_SELECT = `SELECT q.*, COALESCE(e.title, y.title, r.title, d.title, c.title,
    CASE q.kind WHEN 'youtube' THEN 'Vidéo YouTube' WHEN 'reflection' THEN 'Note My Mind' ELSE q.ref END) AS title FROM prepare_queue q
  LEFT JOIN episodes e ON q.kind='episode' AND e.id=q.ref
  LEFT JOIN episodes y ON q.kind='youtube' AND y.id=(SELECT id FROM episodes WHERE video_id=q.ref LIMIT 1)
  LEFT JOIN reflections r ON q.kind='reflection' AND r.id=q.ref
  LEFT JOIN dossier_runs d ON q.kind='dossier' AND d.id=q.ref
  LEFT JOIN contents c ON c.id=q.content_id`;

export async function expireExhausted(env: Env, now = new Date().toISOString()) {
  await env.DB.prepare(`UPDATE prepare_queue SET status='failed', stage=NULL, lease_token=NULL, lease_owner=NULL,
    lease_expires_at=NULL, error=COALESCE(error,'Préparation interrompue : trois tentatives épuisées.'), updated_at=?
    WHERE attempts>=max_attempts AND (status='pending' OR (status='leased' AND lease_expires_at<=?))`).bind(now,now).run();
}
