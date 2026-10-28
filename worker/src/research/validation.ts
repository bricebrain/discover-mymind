import { parseSafeUrl } from '../security/safeUrl';
import type { Evidence, ResearchArticle, Review } from './types';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objet de recherche invalide.');
  return value as Record<string, unknown>;
};
const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max && !/<\/?[a-z][^>]*>/i.test(value);

export function validateArticle(value: unknown, sources: Evidence[]): ResearchArticle | null {
  const v = object(value);
  if (v.skip === true) return null;
  if (!text(v.title, 12, 200) || !text(v.summary, 40, 800) || typeof v.topicKey !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.topicKey) || v.topicKey.length > 100 ||
      !Array.isArray(v.sections) || v.sections.length < 4 || v.sections.length > 8) throw new Error('Article de recherche invalide.');
  const ids = new Set(sources.map(s => s.id));
  const sections = v.sections.map(value => {
    const s = object(value);
    if (!text(s.heading, 3, 150) || !text(s.text, 80, 6000) || !Array.isArray(s.sourceIds) || !s.sourceIds.length ||
        s.sourceIds.length > sources.length || s.sourceIds.some(id => typeof id !== 'string' || !ids.has(id))) {
      throw new Error('Passage sans provenance vérifiable.');
    }
    return { heading: s.heading, text: s.text, sourceIds: [...new Set(s.sourceIds as string[])] };
  });
  const words = sections.map(s => s.text).join(' ').trim().split(/\s+/).length;
  if (words < 400 || words > 1600) throw new Error(`Article hors longueur : ${words} mots (400 à 1600 attendus).`);
  const used = new Set(sections.flatMap(s => s.sourceIds));
  const cited = sources.filter(s => used.has(s.id));
  if (cited.length < 3 || new Set(cited.map(s => parseSafeUrl(s.url).hostname.replace(/^www\./, ''))).size < 2) {
    throw new Error('Trois documents de deux organismes au moins sont nécessaires.');
  }
  return { title: v.title, summary: v.summary, topicKey: v.topicKey, sections, sources: cited };
}

export function validateReview(value: unknown): Review {
  const v = object(value);
  if (!['ok', 'review', 'rejected'].includes(String(v.verdict)) || !Array.isArray(v.reasons) ||
      v.reasons.length > 20 || v.reasons.some(r => !text(r, 3, 1000))) throw new Error('Contrôle documentaire invalide.');
  return { verdict: v.verdict as Review['verdict'], reasons: v.reasons as string[] };
}

const terms = (value: string) => new Set(value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter(w => w.length > 3));
export function isDuplicate(article: Pick<ResearchArticle, 'title' | 'topicKey'>, history: { title: string; topicKey: string }[]) {
  const a = terms(`${article.title} ${article.topicKey}`);
  return history.some(old => {
    if (old.topicKey === article.topicKey) return true;
    const b = terms(`${old.title} ${old.topicKey}`), shared = [...a].filter(w => b.has(w)).length;
    return shared >= 3 && shared / (a.size + b.size - shared) >= 0.5;
  });
}

export function articleText(article: ResearchArticle) {
  return article.sections.map(s => `${s.heading}\n${s.text}\nSources : ${s.sourceIds.join(', ')}`).join('\n\n') +
    '\n\nSources documentaires\n' + article.sources.map(s => `${s.id} — ${s.title}\n${s.url}`).join('\n\n') +
    '\n\nSynthèse rédigée avec une IA à partir des sources citées et soumise à un contrôle documentaire automatisé.';
}
