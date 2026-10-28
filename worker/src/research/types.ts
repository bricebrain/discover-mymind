export const TOPICS = {
  ai: 'Intelligence artificielle : recherche, fonctionnement, usages et limites',
  science: 'Recherche scientifique dans tous les domaines, avec explication des méthodes et résultats',
  potential: 'Capacités humaines : apprentissage, mémoire, concentration et potentiel, fondés sur la recherche',
  economy: 'Économie des entreprises : fusions, acquisitions, stratégies, investissements et innovations',
  future: 'Grands projets d’avenir : recherche, énergie, espace, infrastructures et industrie',
} as const;
export type Topic = keyof typeof TOPICS;
export interface Evidence { id: string; title: string; url: string; text: string }
export interface ResearchArticle {
  title: string; summary: string; topicKey: string;
  sections: { heading: string; text: string; sourceIds: string[] }[];
  sources: Evidence[];
}
export interface Review { verdict: 'ok' | 'review' | 'rejected'; reasons: string[] }
export interface DraftRow {
  id: string; run_id: string; topic_key: string; title: string; topic: Topic;
  article_json: string; review_json: string; state: 'draft' | 'published' | 'rejected'; created_at: string;
}
export const RESERVE_MICROS = 250_000;
export const MONTHLY_MICROS = 10_000_000;
export const WEEKLY_DRAFTS = 3;
export const MAX_PENDING = 6;
