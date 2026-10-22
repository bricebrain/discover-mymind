import curatedSources from '../../../contracts/affaires-sources.json';
import { HttpError } from '../http';

/** Une URL de décision précise, jamais un résultat de recherche ni une collecte. */
export function judgmentUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) invalid();
  const curated = curatedSources.find(source => source.url === url.href);
  if (curated) return curated.url;
  const path = url.pathname.replace(/\/data\.xml$/, '').replace(/\/$/, '');
  if (['courtlistener.com','www.courtlistener.com'].includes(url.hostname) && /^\/opinion\/[0-9]+(?:\/[a-zA-Z0-9_-]+)?$/.test(path))
    return 'https://www.courtlistener.com' + path + '/';
  if (url.hostname === 'caselaw.nationalarchives.gov.uk' && /^\/(?:[a-z]+\/(?:[a-z]+\/)?[0-9]{4}\/[0-9]+|d-[0-9a-f-]{36})$/.test(path))
    return 'https://caselaw.nationalarchives.gov.uk' + path;
  return invalid();
}
function invalid(): never { throw new HttpError(422, 'invalid_judgment', 'Lien HTTPS d’une décision CourtListener, Find Case Law ou d’une source du catalogue vérifié requis.'); }
