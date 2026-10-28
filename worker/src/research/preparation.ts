import type { Env } from '../env';
import { prepareOptions } from '../queue/options';
import type { ResearchArticle } from './types';

/** L'article garde ses références ; seule sa narration française passe dans le parcours anglais guidé. */
export async function preparePublishedResearch(env: Env, id: string) {
  const row = await env.DB.prepare(`SELECT d.article_json FROM research_drafts d JOIN articles a ON a.id=d.id
    WHERE d.id=? AND d.state='published' AND a.source_id='discover-research'`).bind(id).first<{ article_json: string }>();
  if (!row) return;
  const article = JSON.parse(row.article_json) as ResearchArticle;
  const text = [article.title, article.summary, ...article.sections.flatMap(s => [s.heading, s.text])].join('\n\n');
  const noteId = crypto.randomUUID(), now = new Date().toISOString();
  const options = JSON.stringify(prepareOptions({ coverage: 'guided', level: 'B1' }, 'fr', null));
  // Les conditions sont réévaluées dans la transaction : reprise et publications concurrentes ne doublonnent pas.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO reflections(id,title,body_md,kind,tags_json,origin,source_name,source_url,created_at,updated_at)
      SELECT ?,?,?,'synthesis','[]','article','Discover · Recherche Gemini',url,?,? FROM articles
      WHERE id=? AND reflection_id IS NULL`).bind(noteId, article.title.slice(0,200), text, now, now, id),
    env.DB.prepare(`UPDATE articles SET reflection_id=? WHERE id=? AND reflection_id IS NULL
      AND EXISTS(SELECT 1 FROM reflections WHERE id=?)`).bind(noteId,id,noteId),
    env.DB.prepare(`INSERT OR IGNORE INTO prepare_queue(id,kind,ref,options_json,created_at,updated_at)
      SELECT ?,'reflection',r.id,?,?,? FROM articles a JOIN reflections r ON r.id=a.reflection_id
      WHERE a.id=? AND r.deleted_at IS NULL AND r.english_content_id IS NULL
      AND COALESCE((SELECT value FROM app_settings WHERE key='auto_prepare_enabled'),'1')='1'
      AND NOT EXISTS(SELECT 1 FROM prepare_queue q WHERE q.kind='reflection' AND q.ref=r.id)`)
      .bind(crypto.randomUUID(),options,now,now,id),
  ]);
}

/** Rattrape aussi les articles publiés avant l'intégration à l'Atelier, sans relancer un échec ou une annulation. */
export async function recoverResearchPreparations(env: Env) {
  const rows = await env.DB.prepare(`SELECT a.id FROM articles a JOIN research_drafts d ON d.id=a.id
    LEFT JOIN reflections r ON r.id=a.reflection_id
    WHERE a.source_id='discover-research' AND d.state='published'
      AND (a.reflection_id IS NULL OR (r.deleted_at IS NULL AND r.english_content_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM prepare_queue q WHERE q.kind='reflection' AND q.ref=r.id)))
    ORDER BY a.created_at LIMIT 10`).all<{ id: string }>();
  for (const row of rows.results) await preparePublishedResearch(env,row.id);
}
