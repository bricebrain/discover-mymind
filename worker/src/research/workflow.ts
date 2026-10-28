import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { Env } from '../env';
import { sha256Hex } from '../security/crypto';
import { active, checkpoint, history } from './store';
import { generateJson, readEvidence, searchWeb, type SearchResult } from './provider';
import { CHECK_PROMPT, SEARCH_PROMPT, WRITE_PROMPT } from './prompts';
import { isDuplicate, validateArticle, validateReview } from './validation';
import { TOPICS, type Evidence, type ResearchArticle, type Review } from './types';
import { publishApprovedDrafts } from './automatic';

const PAID = { retries: { limit: 0, delay: '1 second' as const }, timeout: '5 minutes' as const };
const load = async <T>(env: Env, id: string, name: string): Promise<T> => {
  const file = await env.FILES.get(`research/${id}/${name}.json`);
  if (!file) throw new Error('Étape documentaire manquante.');
  return file.json<T>();
};

export class ResearchPreparation extends WorkflowEntrypoint<Env, { id: string }> {
  override async run(event: WorkflowEvent<{ id: string }>, step: WorkflowStep) {
    const id = event.payload.id;
    try {
      const context = await step.do('contexte', async () => {
        const run = await active(this.env, id);
        await this.env.DB.prepare("UPDATE research_runs SET state='running',updated_at=? WHERE id=? AND state='reserved'")
          .bind(new Date().toISOString(), id).run();
        return { ...run, at: new Date().toISOString(), history: await history(this.env) };
      });
      const found = await step.do('veille-web', PAID, async () => {
        const search = await checkpoint(this.env, id, 'search', () => searchWeb(this.env, SEARCH_PROMPT,
          { date: context.at, topic: TOPICS[context.topic], history: context.history }));
        return !!search;
      });
      const finish = async () => {
        await this.env.DB.prepare("UPDATE research_runs SET state='skipped',updated_at=? WHERE id=? AND state='running'")
          .bind(new Date().toISOString(), id).run();
      };
      // La veille reste quotidienne ; au-delà de trois créneaux hebdomadaires, on ne paie pas la rédaction.
      if (!found || !context.draft_slot) { await step.do('sans-brouillon', finish); return { id, state: 'skipped' }; }
      await step.do('documents', PAID, async () => {
        await checkpoint(this.env, id, 'evidence', async () => readEvidence(await load<SearchResult>(this.env, id, 'search')));
      });
      const written = await step.do('redaction', PAID, async () => {
        const search = await load<SearchResult>(this.env, id, 'search'), sources = await load<Evidence[]>(this.env, id, 'evidence');
        // Conserver la réponse avant validation permet de diagnostiquer un refus sans repayer la rédaction.
        const raw = await checkpoint(this.env, id, 'writing', () => generateJson(this.env, WRITE_PROMPT, {
          date: context.at, topic: TOPICS[context.topic], report: search.report, sources, history: context.history,
        }));
        const article = await checkpoint(this.env, id, 'article', async () => {
          const result = validateArticle(raw, sources);
          if (result && isDuplicate(result, context.history)) return null;
          return result;
        });
        return !!article;
      });
      if (!written) { await step.do('sujet-ecarte', finish); return { id, state: 'skipped' }; }
      await step.do('controle-documentaire', PAID, async () => {
        await checkpoint(this.env, id, 'review', async () => {
          const article = await load<ResearchArticle>(this.env, id, 'article');
          return validateReview(await generateJson(this.env, CHECK_PROMPT, {
            date: context.at, topic: TOPICS[context.topic], article, history: context.history,
          }));
        });
      });
      await step.do('brouillon-a-valider', async () => {
        await active(this.env, id);
        const article = await load<ResearchArticle>(this.env, id, 'article');
        const review = await load<Review>(this.env, id, 'review');
        const search = await load<SearchResult>(this.env, id, 'search');
        const draftId = (await sha256Hex(`research:${id}`)).slice(0, 20), now = new Date().toISOString();
        await this.env.DB.batch([
          this.env.DB.prepare(`INSERT OR IGNORE INTO research_drafts(id,run_id,topic_key,title,topic,article_json,review_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)`).bind(draftId, id, article.topicKey, article.title, context.topic,
            JSON.stringify({ ...article, searchHtml: search.searchHtml }), JSON.stringify(review), now, now),
          this.env.DB.prepare("UPDATE research_runs SET state='drafted',updated_at=? WHERE id=? AND state='running'").bind(now, id),
        ]);
      });
      await step.do('publication-automatique', () => publishApprovedDrafts(this.env));
      return { id, state: 'drafted' };
    } catch (error) {
      await step.do('arret', async () => {
        // Pas de contenu fournisseur ni de secret dans le journal public.
        const message = error instanceof Error && /^(Documentation insuffisante|La recherche|Article |Passage |Trois documents|Recherche arrêtée|Étape déjà envoyée)/.test(error.message)
          ? error.message.slice(0, 240) : 'La recherche ou son contrôle a échoué ; aucun appel payé ne sera relancé.';
        await this.env.DB.prepare("UPDATE research_runs SET state='failed',error=?,updated_at=? WHERE id=? AND state IN ('reserved','running')")
          .bind(message, new Date().toISOString(), id).run();
      });
      throw new Error('Recherche Discover arrêtée ; consulter la page Recherches.');
    }
  }
}
