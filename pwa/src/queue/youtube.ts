/** Reconnaît les liens de partage usuels ; seule la vidéo canonique est envoyée au serveur. */
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0]
      : host === 'youtube.com' ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
