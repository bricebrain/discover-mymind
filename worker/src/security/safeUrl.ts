import { HttpError } from '../http';

/**
 * Validation des URLs externes (§ 8.4) : flux, enclosures, transcriptions, annuaire Apple.
 * Une URL refusée lève HttpError(400, 'unsafe_url').
 */
const BLOCKED_SUFFIXES = ['.local', '.internal', '.lan', '.localhost', '.home.arpa', '.intranet', '.corp'];
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export interface SafeUrlOptions {
  /** http: accepté (flux RSS qui n'existent pas en HTTPS). */
  allowHttp?: boolean;
}

export function parseSafeUrl(raw: string, opts: SafeUrlOptions = {}): URL {
  const fail = (why: string): never => {
    throw new HttpError(400, 'unsafe_url', `URL refusée : ${why}.`);
  };
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) fail('longueur invalide');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return fail('URL invalide');
  }
  if (url.protocol !== 'https:' && !(opts.allowHttp && url.protocol === 'http:')) fail('schéma non autorisé');
  if (url.username || url.password) fail('identifiants interdits dans l’URL');
  if (url.port) fail('port non standard');
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || host.includes(':') || IPV4.test(host)) fail('adresse IP littérale');
  if (host === 'localhost' || !host.includes('.') || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    fail('hôte interne');
  }
  return url;
}

export interface SafeFetchOptions extends SafeUrlOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
}

/** fetch qui suit les redirections à la main (3 au maximum), chacune revalidée. */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  let url = parseSafeUrl(raw, opts);
  const max = opts.maxRedirects ?? 3;
  for (let hop = 0; ; hop++) {
    const res = await fetcher(url.toString(), {
      headers: opts.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (res.status < 300 || res.status >= 400 || res.status === 304) return res;
    const location = res.headers.get('Location');
    await res.body?.cancel();
    if (!location) throw new HttpError(502, 'bad_redirect', 'Redirection sans destination.');
    if (hop >= max) throw new HttpError(502, 'too_many_redirects', 'Trop de redirections.');
    url = parseSafeUrl(new URL(location, url).toString(), opts);
  }
}
