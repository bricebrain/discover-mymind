import type { Env } from '../env';
import { boundedBytes, boundedJson } from '../cloud/transport';
import { MODEL } from '../cloud/types';
import { htmlToText } from '../articles/feed';
import { parseSafeUrl } from '../security/safeUrl';
import type { Evidence } from './types';

interface Candidate {
  finishReason?: string;
  content?: { parts?: { text?: string; thought?: boolean }[] };
  groundingMetadata?: {
    webSearchQueries?: string[];
    searchEntryPoint?: { renderedContent?: string };
    groundingChunks?: { web?: { uri?: string; title?: string } }[];
  };
}
export interface SearchResult { report: string; links: { title: string; url: string }[]; searchHtml: string }

/** Un appel payé par étape, jamais de reprise automatique du fournisseur. */
async function generate(env: Env, instruction: string, input: unknown, search: boolean, fetcher: typeof fetch) {
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(180_000),
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GEMINI_API_KEY! },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
      ...(search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.15, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'minimal' },
        ...(!search ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  const data = await boundedJson(response) as { candidates?: Candidate[] };
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw new Error('Réponse de recherche interrompue ou refusée.');
  const text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('').trim();
  if (!text) throw new Error('Réponse de recherche vide.');
  return { candidate, text };
}

export async function searchWeb(env: Env, instruction: string, input: unknown, fetcher: typeof fetch = fetch): Promise<SearchResult | null> {
  const { candidate, text } = await generate(env, instruction, input, true, fetcher);
  if (text === 'AUCUN_SUJET') return null;
  const metadata = candidate.groundingMetadata;
  if (!metadata?.webSearchQueries?.length) throw new Error('La recherche Web n’a pas été effectuée.');
  const links: SearchResult['links'] = [];
  for (const chunk of metadata.groundingChunks ?? []) {
    if (!chunk.web?.uri || !chunk.web.title) continue;
    try {
      const url = parseSafeUrl(chunk.web.uri).toString();
      if (!links.some(s => s.url === url)) links.push({ url, title: chunk.web.title.slice(0, 300) });
    } catch { /* Une référence non publique ne devient jamais une source. */ }
  }
  if (links.length < 3) throw new Error('La recherche n’a pas fourni assez de références.');
  return { report: text.slice(0, 20_000), links: links.slice(0, 8), searchHtml: metadata.searchEntryPoint?.renderedContent ?? '' };
}

export async function generateJson(env: Env, instruction: string, input: unknown, fetcher: typeof fetch = fetch): Promise<unknown> {
  const { text } = await generate(env, instruction, input, false, fetcher);
  try { return JSON.parse(text); } catch { throw new Error('Réponse de rédaction illisible.'); }
}

async function fetchDocument(raw: string, fetcher: typeof fetch): Promise<{ url: string; text: string } | null> {
  let url = parseSafeUrl(raw).toString();
  for (let hop = 0; hop <= 5; hop++) {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'text/html,text/plain;q=0.8', 'User-Agent': 'Discover/1.0 (veille documentaire personnelle)' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      await response.body?.cancel();
      if (!location || hop === 5) return null;
      url = parseSafeUrl(new URL(location, url).toString()).toString();
      continue;
    }
    if (!response.ok || !/text\/(html|plain)/i.test(response.headers.get('Content-Type') ?? '')) {
      await response.body?.cancel(); return null;
    }
    const html = new TextDecoder().decode(await boundedBytes(response, 1_500_000));
    // Un extrait protégé ne doit pas être présenté comme une étude lue dans son intégralité.
    if (/isAccessibleForFree["']?\s*:\s*["']?false|pour lire la suite|subscribe to (continue|read)/i.test(html)) return null;
    const main = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
      ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
    const text = htmlToText(main.replace(/<(nav|header|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')).slice(0, 16_000);
    return text.length >= 800 ? { url, text } : null;
  }
  return null;
}

/** Les affirmations sont rédigées puis contrôlées contre les pages réellement récupérées. */
export async function readEvidence(search: SearchResult, fetcher: typeof fetch = fetch): Promise<Evidence[]> {
  const sources: Evidence[] = [];
  for (const link of search.links) {
    try {
      const document = await fetchDocument(link.url, fetcher);
      if (document && !sources.some(s => s.url === document.url)) sources.push({ id: `s${sources.length + 1}`, title: link.title, ...document });
    } catch { /* Page inaccessible, trop volumineuse ou refusée : chercher dans les autres références. */ }
    if (sources.length === 5) break;
  }
  if (sources.length < 3 || new Set(sources.map(s => new URL(s.url).hostname.replace(/^www\./, ''))).size < 2) {
    throw new Error('Documentation insuffisante : trois pages accessibles de deux organismes sont nécessaires.');
  }
  return sources;
}
