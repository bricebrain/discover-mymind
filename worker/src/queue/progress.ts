import type { Env } from '../env';
import type { QueueRow } from './store';

/**
 * Avancement d'une préparation en cours : étapes prévues, étape courante, pourcentage et temps restant estimé.
 * Les durées viennent des préparations précédentes (journal des étapes) ; à défaut, de valeurs prudentes.
 */
const DEFAULTS: Record<string, number> = {
  download: 30, normalize: 20, transcribe: 240, plan: 40, extract: 60, adapt: 120, evaluate: 40, translate: 90, tts: 150, publish: 20,
};
// Dans le cloud, le contrôle de fidélité tourne pendant la voix (étape « tts »).
const CLOUD_DEFAULTS: Record<string, number> = { transcribe: 60, adapt: 40, tts: 40, publish: 10 };

export function plannedStages(row: Pick<QueueRow, 'kind' | 'executor' | 'options_json'>): string[] {
  if (row.executor === 'cloud') return ['transcribe', 'adapt', 'tts', 'publish'];
  let faithful = false;
  try { faithful = !!(JSON.parse(row.options_json) as { faithful?: boolean }).faithful; } catch { /* options illisibles : sans fidèle */ }
  const source = row.kind === 'reflection' || row.kind === 'dossier' ? ['download'] : ['download', 'normalize', 'transcribe'];
  return [...source, 'plan', 'extract', 'adapt', 'evaluate', ...(faithful ? ['translate'] : []), 'tts', 'publish'];
}

export type Averages = Map<string, number>;
const key = (kind: string, executor: string, stage: string) => `${kind}|${executor}|${stage}`;

/** Moyennes des 400 dernières étapes terminées, par type de source, exécutant et étape. */
export async function stageAverages(env: Env): Promise<Averages> {
  const { results } = await env.DB.prepare(`SELECT kind, executor, stage, AVG(seconds) AS avg FROM
    (SELECT kind, executor, stage, seconds FROM queue_stage_log ORDER BY id DESC LIMIT 400) GROUP BY kind, executor, stage`)
    .all<{ kind: string; executor: string; stage: string; avg: number }>();
  return new Map(results.map((r) => [key(r.kind, r.executor, r.stage), r.avg]));
}

function expectedSeconds(row: Pick<QueueRow, 'kind' | 'executor' | 'options_json'>, averages: Averages) {
  const defaults = row.executor === 'cloud' ? CLOUD_DEFAULTS : DEFAULTS;
  return plannedStages(row).map((s) => Math.max(3, averages.get(key(row.kind, row.executor, s)) ?? defaults[s] ?? 30));
}

export interface Waiting { position: number; ahead: number; aheadTitle: string | null; startInSec: number }

/**
 * Place d'une demande dans la file du Mac (une préparation à la fois, dans l'ordre d'arrivée) et délai avant son début :
 * temps restant de la préparation en cours plus la durée prévue des demandes placées avant elle.
 */
export function waitingOf(active: (QueueRow & { stage_started_at?: string | null })[], averages: Averages, now = Date.now()): Map<string, Waiting> {
  const out = new Map<string, Waiting>();
  let elapsed = 0, ahead = 0, first: string | null = null;
  for (const row of active) {
    if (row.status === 'pending' && (row.stage === 'review' || row.stage === 'source_ready')) continue;
    if (row.status === 'pending') out.set(row.id, { position: ahead + 1, ahead, aheadTitle: first, startInSec: Math.round(elapsed) });
    elapsed += row.status === 'leased' ? (progressOf(row, averages, now)?.remainingSec ?? 0) : expectedSeconds(row, averages).reduce((a, b) => a + b, 0);
    first ??= row.title ?? null;
    ahead += 1;
  }
  return out;
}

export interface Progress {
  stages: string[]; current: number; percent: number; remainingSec: number;
  startedAt: string | null; stageStartedAt: string | null; history: boolean;
}

export function progressOf(row: QueueRow & { started_at?: string | null; stage_started_at?: string | null }, averages: Averages, now = Date.now()): Progress | null {
  if (row.status !== 'leased' || !row.stage) return null;
  const stages = plannedStages(row);
  const current = stages.indexOf(row.stage);
  if (current < 0) return null;
  const defaults = row.executor === 'cloud' ? CLOUD_DEFAULTS : DEFAULTS;
  let history = false;
  const expected = stages.map((s) => {
    const avg = averages.get(key(row.kind, row.executor, s));
    if (avg !== undefined) history = true;
    return Math.max(3, avg ?? defaults[s] ?? 30);
  });
  const stageStart = row.stage_started_at ? Date.parse(row.stage_started_at) : NaN;
  const inStage = Number.isFinite(stageStart) ? Math.max(0, (now - stageStart) / 1000) : 0;
  // L'étape en cours ne dépasse jamais 95 % de sa durée prévue : si elle s'allonge, l'estimation glisse au lieu de mentir.
  const doneInStage = Math.min(inStage, expected[current]! * 0.95);
  const before = expected.slice(0, current).reduce((a, b) => a + b, 0);
  const total = expected.reduce((a, b) => a + b, 0);
  const remainingCurrent = Math.max(expected[current]! - inStage, expected[current]! * 0.05);
  const remainingSec = Math.round(remainingCurrent + expected.slice(current + 1).reduce((a, b) => a + b, 0));
  const percent = Math.max(1, Math.min(99, Math.round(((before + doneInStage) / total) * 100)));
  return { stages, current, percent, remainingSec, startedAt: row.started_at ?? null, stageStartedAt: row.stage_started_at ?? null, history };
}

/** Dernier contact de l'Atelier (bail ou signal de vie) : écrit au plus une fois par minute. */
export async function markAtelierSeen(env: Env) {
  const now = new Date().toISOString(), staleBefore = new Date(Date.now() - 60_000).toISOString();
  const result = await env.DB.prepare(`INSERT INTO app_settings (key, value) VALUES ('atelier_seen_at', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE app_settings.value < ?`).bind(now, staleBefore).run();
  // Met à jour la présence sans obliger l'app à relire toute la file pendant une longue étape.
  if (result.meta.changes) {
    try { await env.EVENTS.getByName('personal-library').atelierSeen(now); }
    catch { console.warn(JSON.stringify({event:'atelier_presence_deferred'})); }
  }
}
export async function atelierSeenAt(env: Env) {
  return (await env.DB.prepare("SELECT value FROM app_settings WHERE key='atelier_seen_at'").first<{ value: string }>())?.value ?? null;
}
