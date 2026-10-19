import type { Env } from '../env';
import { pageSql, type Page } from './pagination';

export interface ExportDossier {
  id: string; title: string; version: number; createdAt: string; updatedAt: string;
  sources: unknown[];
  runs: { id: string; version: number; title: string; sources: unknown[]; options: unknown; createdAt: string;
    preparation: { status: string; contentId: string | null } | null }[];
}

export async function loadDossiers(env: Env, page?: Page): Promise<ExportDossier[]> {
  const [ds, runs] = await Promise.all([
    env.DB.prepare(`SELECT id, title, version, sources_json, created_at, updated_at FROM dossiers ORDER BY created_at, id ${pageSql(page, 1)}`).all<{ id: string; title: string; version: number; sources_json: string; created_at: string; updated_at: string }>(),
    env.DB.prepare(
      `SELECT r.id, r.dossier_id, r.version, r.title, r.sources_json, r.options_json, r.created_at,
              q.status AS queue_status, q.content_id AS queue_content_id
         FROM dossier_runs r LEFT JOIN prepare_queue q
           ON q.id = (SELECT id FROM prepare_queue WHERE kind = 'dossier' AND ref = r.id ORDER BY created_at DESC LIMIT 1)
        WHERE r.dossier_id IN (SELECT id FROM dossiers ORDER BY created_at, id ${pageSql(page, 1)}) ORDER BY r.created_at, r.id`,
    ).all<{ id: string; dossier_id: string; version: number; title: string; sources_json: string; options_json: string; created_at: string; queue_status: string | null; queue_content_id: string | null }>(),
  ]);
  const byDossier = new Map<string, typeof runs.results>();
  for (const r of runs.results) byDossier.set(r.dossier_id, [...(byDossier.get(r.dossier_id) ?? []), r]);
  return ds.results.map((d) => ({
    id: d.id, title: d.title, version: d.version, createdAt: d.created_at, updatedAt: d.updated_at,
    sources: JSON.parse(d.sources_json) as unknown[],
    runs: (byDossier.get(d.id) ?? []).map((r) => ({
      id: r.id, version: r.version, title: r.title, sources: JSON.parse(r.sources_json) as unknown[],
      options: JSON.parse(r.options_json) as unknown, createdAt: r.created_at,
      preparation: r.queue_status ? { status: r.queue_status, contentId: r.queue_content_id } : null,
    })),
  }));
}

