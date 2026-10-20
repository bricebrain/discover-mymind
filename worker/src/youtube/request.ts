import { safeFetch, type SafeFetchOptions } from '../security/safeUrl';

/** www.youtube.com peut renvoyer 404/5xx pour un flux disponible sur youtube.com. */
export async function fetchYoutubeFeed(url: string, options: SafeFetchOptions, fetcher: typeof fetch): Promise<Response> {
  const response = await safeFetch(url, options, fetcher);
  if (response.status !== 404 && response.status < 500) return response;
  const fallback = new URL(url);
  if (fallback.hostname !== 'www.youtube.com' || fallback.pathname !== '/feeds/videos.xml') return response;
  await response.body?.cancel();
  fallback.hostname = 'youtube.com';
  return safeFetch(fallback.toString(), options, fetcher);
}
