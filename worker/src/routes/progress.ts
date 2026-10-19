import { listeningStatement } from '../weekly/activity';
import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';

/**
 * Progression d'écoute, toujours par audio précis (§ 4) : un épisode original ou une variante.
 * `audioRef` identifie le fichier (URL officielle ou sha256) : s'il change, la position repart de zéro.
 */
const TARGET_ID = { episode: /^[0-9a-f]{20}$/, variant: /^[a-z0-9-]{3,96}:[a-z0-9-]{2,32}$/ } as const;
type TargetType = keyof typeof TARGET_ID;
const MAX_MS = 24 * 3_600_000;

function target(type: unknown, id: unknown): { type: TargetType; id: string } {
  if ((type !== 'episode' && type !== 'variant') || typeof id !== 'string' || !TARGET_ID[type].test(id)) {
    throw new HttpError(400, 'invalid_target', 'Cible de progression invalide.');
  }
  return { type, id };
}

const ms = (v: unknown, name: string, optional = false): number | null => {
  if (optional && (v === null || v === undefined)) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_MS) throw new HttpError(400, 'invalid_body', `${name} invalide.`);
  return Math.round(v);
};

/** PUT /api/progress */
export async function save(req: Request, env: Env): Promise<Response> {
  const b = await readJson<Record<string, unknown>>(req, 2048);
  const t = target(b.targetType, b.targetId);
  if (typeof b.audioRef !== 'string' || b.audioRef.length === 0 || b.audioRef.length > 2048) {
    throw new HttpError(400, 'invalid_body', 'audioRef invalide.');
  }
  const position = ms(b.positionMs, 'positionMs')!;
  const duration = ms(b.durationMs, 'durationMs', true);
  const completed = b.completed === true ? 1 : 0;
  const now = new Date();
  await env.DB.batch([
    listeningStatement(env, t.type, t.id, b.audioRef, position, completed, now),
    env.DB.prepare(
      `INSERT INTO listening_progress (target_type, target_id, audio_ref, position_ms, duration_ms, completed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (target_type, target_id) DO UPDATE SET
       audio_ref = excluded.audio_ref, position_ms = excluded.position_ms, duration_ms = excluded.duration_ms,
       completed = excluded.completed, updated_at = excluded.updated_at`,
    ).bind(t.type, t.id, b.audioRef, position, duration, completed, now.toISOString()),
  ]);
  return json({ ok: true });
}

/** GET /api/progress/:type/:id?audioRef=… — position seulement si l'audio est le même. */
export async function get(req: Request, env: Env, type: string, id: string): Promise<Response> {
  const t = target(type, id);
  const audioRef = new URL(req.url).searchParams.get('audioRef');
  const row = await env.DB.prepare(
    `SELECT audio_ref AS audioRef, position_ms AS positionMs, duration_ms AS durationMs, completed, updated_at AS updatedAt
       FROM listening_progress WHERE target_type = ? AND target_id = ?`,
    ).bind(t.type, t.id).first<{ audioRef: string; positionMs: number; durationMs: number | null; completed: number; updatedAt: string }>();
  if (!row || (audioRef !== null && row.audioRef !== audioRef)) return json({ progress: null });
  return json({ progress: { ...row, completed: row.completed === 1 } });
}
