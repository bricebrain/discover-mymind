import { HttpError } from '../http';
import { decodeEntities } from '../feedParser';
import { parseSafeUrl, safeFetch } from '../security/safeUrl';
import { CHANNEL_ID, channelFeedUrl } from './feed';

/** Accepte uniquement une chaîne YouTube ; les liens de vidéo continuent à utiliser leur propre parcours. */
export function channelInput(input: string): { id: string | null; url: string } {
  const value = input.trim();
  if (CHANNEL_ID.test(value)) return { id: value, url: `https://www.youtube.com/channel/${value}` };
  const url = parseSafeUrl(value.startsWith('@') ? `https://www.youtube.com/${value}` : value);
  if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    throw new HttpError(422, 'invalid_channel', 'Colle un lien de chaîne YouTube ou son @identifiant.');
  }
  if (url.pathname === '/feeds/videos.xml') {
    const id = url.searchParams.get('channel_id');
    if (id && CHANNEL_ID.test(id)) return { id, url: `https://www.youtube.com/channel/${id}` };
  }
  const direct = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/(?:videos|featured|streams|shorts))?\/?$/);
  if (direct) return { id: direct[1]!, url: `https://www.youtube.com/channel/${direct[1]}` };
  const handle = url.pathname.match(/^\/(?:@[^/]+|(?:c|user)\/[^/]+)(?:\/(?:videos|featured|streams|shorts))?\/?$/);
  if (!handle) throw new HttpError(422, 'invalid_channel', 'Lien de chaîne attendu, par exemple youtube.com/@arte.');
  return { id: null, url: `https://www.youtube.com${url.pathname.replace(/\/(videos|featured|streams|shorts)\/?$/, '')}` };
}

/** Lecture HTML progressive et plafonnée : seul le lien RSS/canonique de la chaîne est retenu. */
export async function resolveChannel(input: string, fetcher: typeof fetch = fetch): Promise<string> {
  const candidate = channelInput(input);
  if (candidate.id) return candidate.id;
  const res = await safeFetch(candidate.url, { headers: {
    'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr,en;q=0.8',
    // Lecture anonyme avec refus des cookies facultatifs, sans écran de consentement.
    Cookie: 'SOCS=CAI',
  } }, fetcher);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new HttpError(422, 'channel_unreachable', `Chaîne inaccessible (HTTP ${res.status}).`);
  }
  const source = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let inputBytes = 0;
  try {
    while (inputBytes < 2_000_000) {
      const chunk = await source.read();
      if (chunk.done) break;
      const bytes = chunk.value.subarray(0, 2_000_000 - inputBytes);
      inputBytes += bytes.byteLength;
      const decoded = decoder.decode(bytes, { stream: true });
      chunks.push(decoded);
    }
    chunks.push(decoder.decode());
  } finally { await source.cancel().catch(() => {}); }
  let id: string | null = null;
  const html = chunks.join('');
  const transformed = new HTMLRewriter().on('meta[itemprop=channelId]', {
    element(element) {
      const value = element.getAttribute('content');
      if (value && CHANNEL_ID.test(value)) id = value;
    },
  }).on('link', {
    element(element) {
      const href = decodeEntities(element.getAttribute('href') ?? '');
      if (element.getAttribute('rel') !== 'canonical' && element.getAttribute('type') !== 'application/rss+xml') return;
      try { id = channelInput(href).id ?? id; } catch { /* Un lien non YouTube est ignoré. */ }
    },
  }).transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  // Le corps est déjà plafonné ; laisser HTMLRewriter le terminer évite d'interrompre son pipe natif.
  await transformed.arrayBuffer();
  if (!id) throw new HttpError(422, 'channel_not_found', 'Chaîne non reconnue. Essaie son adresse youtube.com/channel/UC… ou son flux RSS.');
  return id;
}

export function validateChannelFeed(raw: string, channelId: unknown) {
  if (typeof channelId !== 'string' || !CHANNEL_ID.test(channelId) || raw !== channelFeedUrl(channelId)) {
    throw new HttpError(422, 'invalid_channel', 'Le flux doit correspondre à la chaîne YouTube.');
  }
  return channelId;
}
