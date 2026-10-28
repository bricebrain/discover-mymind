import type { Env } from '../env';
import { HttpError } from '../http';
import { MAX_PENDING, MONTHLY_MICROS, RESERVE_MICROS, TOPICS, WEEKLY_DRAFTS, type Topic } from './types';
import { publishApprovedDrafts } from './automatic';

export async function researchEnabled(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='research_enabled'").first<{ value: string }>();
  return row?.value === '1' && !!env.GEMINI_API_KEY;
}

export async function history(env: Env) {
  const rows = await env.DB.prepare(`SELECT title,topic_key AS topicKey,topic,created_at AS createdAt FROM research_drafts
    WHERE created_at>=? ORDER BY created_at DESC LIMIT 120`).bind(new Date(Date.now() - 90 * 86_400_000).toISOString())
    .all<{ title: string; topicKey: string; topic: Topic; createdAt: string }>();
  return rows.results;
}

/** Une réservation quotidienne atomique borne le nombre d'appels, même avec plusieurs déclencheurs. */
export async function reserve(env: Env, now = new Date()) {
  if (!await researchEnabled(env)) throw new HttpError(409, 'research_disabled', 'La veille automatique est désactivée.');
  const at = now.toISOString(), day = at.slice(0, 10), month = at.slice(0, 7);
  const old = await env.DB.prepare('SELECT id,state FROM research_runs WHERE day=?').bind(day).first<{ id: string; state: string }>();
  if (old) return old;
  const recent = await env.DB.prepare('SELECT topic,MAX(created_at) AS last FROM research_runs GROUP BY topic').all<{ topic: Topic; last: string }>();
  const topics = Object.keys(TOPICS) as Topic[];
  topics.sort((a, b) => (recent.results.find(r => r.topic === a)?.last ?? '').localeCompare(recent.results.find(r => r.topic === b)?.last ?? ''));
  const id = crypto.randomUUID(), since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO research_runs(id,day,topic,draft_slot,reserved_micros,created_at,updated_at)
    SELECT ?,?,?,CASE WHEN (SELECT COUNT(*) FROM research_runs WHERE draft_slot=1 AND created_at>?)<? THEN 1 ELSE 0 END,?,?,?
    WHERE COALESCE((SELECT SUM(reserved_micros) FROM research_runs WHERE substr(day,1,7)=?),0)+?<=?
      AND (SELECT COUNT(*) FROM research_drafts WHERE state='draft')<?`)
    .bind(id, day, topics[0], since, WEEKLY_DRAFTS, RESERVE_MICROS, at, at, month, RESERVE_MICROS, MONTHLY_MICROS, MAX_PENDING).run();
  const run = await env.DB.prepare('SELECT id,state FROM research_runs WHERE day=?').bind(day).first<{ id: string; state: string }>();
  if (!run) throw new HttpError(409, 'research_limit', 'Veille suspendue : enveloppe mensuelle atteinte ou six brouillons attendent une validation.');
  return run;
}

export async function dispatchResearch(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT id FROM research_runs WHERE id=? AND state='reserved'").bind(id).first();
  if (!row || !await researchEnabled(env)) return;
  try { await env.RESEARCH.create({ id, params: { id } }); }
  catch { /* Le cron redemande uniquement le même identifiant de Workflow. */ }
}

export async function scheduleResearch(env: Env, now = new Date()) {
  if (now.getUTCHours() === 5 && now.getUTCMinutes() === 47) await cleanupResearch(env, now);
  await env.DB.prepare(`UPDATE research_runs SET state='failed',error='Recherche interrompue ; aucun appel payé ne sera relancé.',updated_at=?
    WHERE state IN ('reserved','running') AND created_at<?`).bind(now.toISOString(), new Date(now.getTime() - 3_600_000).toISOString()).run();
  if (!await researchEnabled(env)) return;
  // Reprend aussi une publication interrompue, sans rappeler Gemini.
  await publishApprovedDrafts(env);
  const reserved = await env.DB.prepare("SELECT id FROM research_runs WHERE state='reserved' LIMIT 1").first<{ id: string }>();
  if (reserved) await dispatchResearch(env, reserved.id);
  // Une veille par jour après 6 h UTC ; aucun rattrapage des jours précédents.
  if (now.getUTCHours() < 6) return;
  try { const run = await reserve(env, now); if (run.state === 'reserved') await dispatchResearch(env, run.id); }
  catch (e) { if (!(e instanceof HttpError)) throw e; }
}

/** Les copies de travail expirent ; l'historique des sujets et des réservations reste disponible. */
async function cleanupResearch(env: Env, now: Date) {
  const rows = await env.DB.prepare(`SELECT id FROM research_runs WHERE state IN ('drafted','skipped','failed')
    AND purged_at IS NULL AND created_at<? LIMIT 5`).bind(new Date(now.getTime() - 30 * 86_400_000).toISOString()).all<{ id: string }>();
  for (const { id } of rows.results) {
    const files = await env.FILES.list({ prefix: `research/${id}/`, limit: 100 });
    if (files.objects.length) await env.FILES.delete(files.objects.map(file => file.key));
    if (!files.truncated) await env.DB.prepare('UPDATE research_runs SET purged_at=? WHERE id=?').bind(now.toISOString(), id).run();
  }
}

export async function active(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT topic,draft_slot FROM research_runs WHERE id=? AND state IN ('reserved','running')")
    .bind(id).first<{ topic: Topic; draft_slot: number }>();
  if (!row || !await researchEnabled(env)) throw new Error('Recherche arrêtée ou désactivée.');
  return row;
}

/** Le marqueur précède l'appel : une interruption ambiguë ne déclenche jamais un second achat. */
export async function checkpoint<T>(env: Env, id: string, name: string, compute: () => Promise<T>): Promise<T> {
  const key = `research/${id}/${name}.json`;
  const previous = await env.FILES.get(key);
  if (previous) return previous.json<T>();
  await active(env, id);
  const start = await env.DB.prepare("INSERT OR IGNORE INTO research_operations(run_id,name,state) VALUES (?,?,'started')").bind(id, name).run();
  if (!start.meta.changes) throw new Error('Étape déjà envoyée ; reprise payante interdite.');
  const result = await compute();
  await env.FILES.put(key, JSON.stringify(result), { httpMetadata: { contentType: 'application/json' } });
  await env.DB.prepare("UPDATE research_operations SET state='done' WHERE run_id=? AND name=?").bind(id, name).run();
  return result;
}
