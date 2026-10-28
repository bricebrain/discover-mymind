import type { Env } from '../env';
import { HttpError, json } from '../http';
import { preparePublishedResearch } from './preparation';
import { articleText } from './validation';
import type { DraftRow, ResearchArticle, Review } from './types';

export async function publishDraft(env: Env, id: string, origin: string) {
  const row = await env.DB.prepare('SELECT * FROM research_drafts WHERE id=?').bind(id).first<DraftRow>();
  if (!row) throw new HttpError(404, 'not_found', 'Brouillon introuvable.');
  if (row.state === 'published') {
    await preparePublishedResearch(env,id);
    return json({ articleId: id });
  }
  const review = JSON.parse(row.review_json) as Review;
  if (row.state !== 'draft' || review.verdict !== 'ok') throw new HttpError(409, 'review_required', 'Le contrôle documentaire doit être favorable avant publication.');
  const article = JSON.parse(row.article_json) as ResearchArticle, now = new Date().toISOString();
  // INSERT conditionnel + transition dans une même transaction : double clic et refus concurrent restent sans effet.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO articles(id,source_id,guid,url,title,summary,author,published_at,content_text,content_status,created_at)
      SELECT ?,'discover-research',?,?,?,?,'Discover · Synthèse assistée par IA',?,?,'complete',?
      WHERE EXISTS(SELECT 1 FROM research_drafts WHERE id=? AND state='draft')`)
      .bind(id, `research:${id}`, `${origin}/?a=${id}`, article.title, article.summary, now, articleText(article), now, id),
    env.DB.prepare("UPDATE research_drafts SET state='published',updated_at=? WHERE id=? AND state='draft' AND EXISTS(SELECT 1 FROM articles WHERE id=?)")
      .bind(now, id, id),
  ]);
  const published = await env.DB.prepare("SELECT id FROM research_drafts WHERE id=? AND state='published'").bind(id).first();
  if (!published) throw new HttpError(409, 'draft_changed', 'Ce brouillon a changé ; actualise la liste.');
  await preparePublishedResearch(env,id);
  return json({ articleId: id });
}

export async function publishedResearch(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT article_json FROM research_drafts WHERE id=? AND state='published'").bind(id).first<{ article_json: string }>();
  if (!row) return null;
  const article = JSON.parse(row.article_json) as ResearchArticle & { searchHtml?: string };
  return { ...article, sources: article.sources.map(({ text: _text, ...source }) => source) };
}
