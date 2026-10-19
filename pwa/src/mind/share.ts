import { cleanPastedArticle } from './cleanPaste';
import type { NoteOrigin } from './store';

/** Journaux connus : nom affiché d'après le site (sinon le domaine). */
const PUBLICATIONS: [RegExp, string][] = [
  [/(^|\.)theguardian\.com$/, 'The Guardian'], [/(^|\.)bbc\.(co\.uk|com)$/, 'BBC'], [/(^|\.)theconversation\.com$/, 'The Conversation'],
  [/(^|\.)propublica\.org$/, 'ProPublica'], [/(^|\.)apnews\.com$/, 'AP News'], [/(^|\.)npr\.org$/, 'NPR'], [/(^|\.)reuters\.com$/, 'Reuters'],
  [/(^|\.)nytimes\.com$/, 'The New York Times'], [/(^|\.)washingtonpost\.com$/, 'The Washington Post'], [/(^|\.)wsj\.com$/, 'The Wall Street Journal'],
  [/(^|\.)bloomberg\.com$/, 'Bloomberg'], [/(^|\.)cnn\.com$/, 'CNN'], [/(^|\.)politico\.(com|eu)$/, 'Politico'], [/(^|\.)axios\.com$/, 'Axios'],
  [/(^|\.)thetimes\.(co\.uk|com)$/, 'The Times'], [/(^|\.)telegraph\.co\.uk$/, 'The Telegraph'], [/(^|\.)ft\.com$/, 'Financial Times'],
  [/(^|\.)economist\.com$/, 'The Economist'], [/(^|\.)independent\.co\.uk$/, 'The Independent'],
  [/(^|\.)lemonde\.fr$/, 'Le Monde'], [/(^|\.)lefigaro\.fr$/, 'Le Figaro'], [/(^|\.)liberation\.fr$/, 'Libération'], [/(^|\.)leparisien\.fr$/, 'Le Parisien'],
  [/(^|\.)lesechos\.fr$/, 'Les Échos'], [/(^|\.)francetvinfo\.fr$/, 'franceinfo'], [/(^|\.)20minutes\.fr$/, '20 Minutes'], [/(^|\.)ouest-france\.fr$/, 'Ouest-France'],
  [/(^|\.)huffingtonpost\.fr$/, 'Le HuffPost'], [/(^|\.)lexpress\.fr$/, 'L’Express'], [/(^|\.)nouvelobs\.com$/, 'L’Obs'], [/(^|\.)mediapart\.fr$/, 'Mediapart'],
  [/(^|\.)courrierinternational\.com$/, 'Courrier international'], [/(^|\.)rfi\.fr$/, 'RFI'], [/(^|\.)france24\.com$/, 'France 24'],
];

export function publicationName(url: string): string | null {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  return PUBLICATIONS.find(([re]) => re.test(host))?.[1] ?? host.replace(/^(www|m|amp)\./, '');
}

const URL_RE = /https?:\/\/[^\s<>"«»]+/i;

export interface SharedNote { title: string; body: string; origin: NoteOrigin; sourceName: string; sourceUrl: string }

/**
 * Ce que Chrome envoie au partage (titre, texte, lien) → une note. Chrome Android met souvent le lien dans `text` :
 * on le retrouve. Le nom du journal en fin de titre (« … | World news | The Guardian ») est retiré.
 */
export function sharedToNote(params: { title?: string | null; text?: string | null; url?: string | null }): SharedNote {
  const rawText = (params.text ?? '').trim();
  const url = (params.url && URL_RE.test(params.url) ? params.url.trim() : rawText.match(URL_RE)?.[0] ?? '').replace(/[).,;]+$/, '');
  const sourceName = url ? publicationName(url) ?? '' : '';
  let title = (params.title ?? '').trim();
  if (sourceName && title) {
    const parts = title.split(/\s+[|–—-]\s+/);
    if (parts.length > 1 && parts.slice(1).some((p) => p.toLowerCase().includes(sourceName.toLowerCase()))) title = parts[0]!;
  }
  const text = url ? rawText.split(url).join('').trim() : rawText;
  // Un simple rappel du titre ou du lien n'est pas un texte d'article.
  const body = text.length >= 40 && text !== title ? cleanPastedArticle(text).text : '';
  return { title: title.slice(0, 200), body, origin: url ? 'article' : 'personal', sourceName: sourceName.slice(0, 120), sourceUrl: url.slice(0, 2048) };
}
