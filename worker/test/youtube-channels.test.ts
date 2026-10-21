import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { collectNext } from '../src/collector';
import { resolve } from '../src/routes/shows';
import { channelInput, resolveChannel } from '../src/youtube/channels';
import { channelFeedUrl, parseYoutubeFeed } from '../src/youtube/feed';
import { fetchYoutubeFeed } from '../src/youtube/request';
import channelMetadata from './fixtures/youtube-channel-metadata.json';
import { ATELIER_TOKEN, call, login, ORIGIN } from './helpers';

const CHANNEL = 'UCwI-JbGNsojunnHbFAc0M4Q';
const VIDEO = 'ZvSfmW9F6tE';
const NOW = Date.parse('2026-10-18T20:00:00Z');
const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const entry = (id = VIDEO, title = 'Une vidéo &amp; une idée') => `<entry><yt:videoId>${id}</yt:videoId>
  <title>${title}</title><published>2026-10-18T18:00:24+00:00</published><media:group>
  <media:thumbnail url="https://i.ytimg.com/vi/${id}/hqdefault.jpg"/>
  <media:description>&lt;p&gt;Une description&lt;/p&gt;</media:description></media:group></entry>`;
const feed = (entries = entry()) => `<feed xmlns="http://www.w3.org/2005/Atom"><title>ARTE</title>
  <author><name>ARTE</name></author>${entries}</feed>`;
const fetcher = (handler: (url: string, init?: RequestInit) => Response) =>
  (async (url: RequestInfo | URL, init?: RequestInit) => handler(String(url), init)) as typeof fetch;
const stream = (xml: string) => {
  const bytes = new TextEncoder().encode(xml); let pos = 0;
  return new ReadableStream<Uint8Array>({ pull(c) {
    if (pos >= bytes.length) return c.close(); c.enqueue(bytes.slice(pos, pos + 17)); pos += 17;
  } });
};
async function subscribe(cookie: string) {
  const res = await call('/api/shows', { method: 'POST', cookie, body: {
    title: 'ARTE', sourceType: 'youtube', channelId: CHANNEL, feedUrl: channelFeedUrl(CHANNEL), language: 'fr', category: 'science',
  } });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json<{ show: { id: string } }>()).show.id;
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM prepare_queue'), env.DB.prepare('DELETE FROM episodes'), env.DB.prepare('DELETE FROM shows')]);
});

describe('résolution et lecture YouTube', () => {
  // Métadonnées publiques des huit chaînes signalées, relevées le 20 octobre 2026.
  it.each(channelMetadata)('résout @$handle et charge son aperçu', async ({ handle, id, html }) => {
    const requested: string[] = [];
    const res = await resolve(new Request(ORIGIN + '/api/shows/resolve', {
      method: 'POST', body: JSON.stringify({ input: `https://www.youtube.com/@${handle}` }),
    }), fetcher((url, init) => {
      requested.push(url);
      if (url === `https://www.youtube.com/@${handle}`) {
        expect(new Headers(init?.headers).get('Cookie')).toBe('SOCS=CAI');
        return new Response(html);
      }
      expect(url).toBe(channelFeedUrl(id));
      return new Response(feed());
    }));
    expect(await res.json()).toMatchObject({ kind: 'preview', preview: { sourceType: 'youtube', channelId: id, feedUrl: channelFeedUrl(id) } });
    expect(requested).toHaveLength(2);
  });
  it.each([CHANNEL, `https://www.youtube.com/channel/${CHANNEL}`, channelFeedUrl(CHANNEL)])('normalise %s', (input) => {
    expect(channelInput(input).id).toBe(CHANNEL);
  });
  it.each(['https://youtube.com.evil.test/@arte', 'https://youtube.com/watch?v=ZvSfmW9F6tE', 'https://youtu.be/ZvSfmW9F6tE',
    'https://user:secret@youtube.com/@arte', 'https://youtube.com/playlist?list=x', 'file:///tmp/channel'])('refuse %s', (input) => {
    expect(() => channelInput(input)).toThrow();
  });
  it('résout un handle et une ancienne URL via le lien canonique, sans choisir un identifiant de vidéo suggérée', async () => {
    for (const input of ['@arte', 'https://youtube.com/user/arte/videos']) {
      const html = `<html><head><script>{"channelId":"UCaaaaaaaaaaaaaaaaaaaaaa"}</script>
        <link href="https://www.youtube.com/channel/${CHANNEL}" rel="canonical"></head></html>`;
      expect(await resolveChannel(input, fetcher(() => new Response(html)))).toBe(CHANNEL);
    }
  });
  it('lit aussi les métadonnées après le head, comme sur les pages YouTube réelles', async () => {
    const chunks = ['<html><head><script>config</script></head><body>',
      `<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}"></body></html>`];
    const body = new ReadableStream<Uint8Array>({ pull(c) {
      const chunk = chunks.shift();
      if (chunk === undefined) c.close(); else c.enqueue(new TextEncoder().encode(chunk));
    } });
    expect(await resolveChannel('@arte', fetcher(() => new Response(body)))).toBe(CHANNEL);
  });
  it('ne retient aucun lien canonique étranger et refuse une chaîne inaccessible', async () => {
    await expect(resolveChannel('@arte', fetcher(() => new Response('<link rel="canonical" href="https://evil.test/x">')))).rejects.toThrow(/non reconnue/);
    await expect(resolveChannel('@arte', fetcher(() => new Response('', { status: 404 })))).rejects.toThrow(/inaccessible/);
  });
  it('plafonne une page HTML volumineuse et annule sa lecture', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new TextEncoder().encode('x'.repeat(64_000))); }, cancel() { cancelled = true; } });
    await expect(resolveChannel('@arte', fetcher(() => new Response(body)))).rejects.toThrow(/non reconnue/);
    expect(cancelled).toBe(true);
  });
  it('lit Atom malgré les balises coupées, décode les textes et conserve le lien de vidéo', async () => {
    const parsed = await parseYoutubeFeed(stream(feed()), { maxItems: 10 });
    expect(parsed.channel?.title).toBe('ARTE');
    expect(parsed.items[0]).toMatchObject({ videoId: VIDEO, guid: `yt:video:${VIDEO}`, title: 'Une vidéo & une idée',
      audioUrl: `https://www.youtube.com/watch?v=${VIDEO}`, durationSec: null, description: 'Une description' });
  });
  it('s’arrête sur une vidéo connue et ignore les identifiants invalides', async () => {
    const parsed = await parseYoutubeFeed(stream(feed(entry('bad') + entry() + entry('aaaaaaaaaaa'))), { maxItems: 10, knownGuids: new Set([`yt:video:${VIDEO}`]) });
    expect(parsed.items).toHaveLength(0); expect(parsed.stoppedAt).toBe('known_guid');
    expect((await parseYoutubeFeed(stream(feed(entry() + entry('aaaaaaaaaaa'))), { maxItems: 1 })).items).toHaveLength(1);
  });
  it('résout un aperçu de chaîne, sans passer par Apple ni exiger un audio de podcast', async () => {
    const res = await resolve(new Request(ORIGIN + '/api/shows/resolve', { method: 'POST', body: JSON.stringify({ input: CHANNEL }) }),
      fetcher((url) => { expect(url).toBe(channelFeedUrl(CHANNEL)); return new Response(feed()); }));
    expect(await res.json()).toMatchObject({ kind: 'preview', preview: { sourceType: 'youtube', channelId: CHANNEL, title: 'ARTE', language: null, latest: [{ title: 'Une vidéo & une idée' }] } });
  });
  it.each([404, 500, 502, 503, 504])('réessaie un flux YouTube HTTP %s sur le domaine officiel sans www', async (status) => {
    const urls: string[] = [];
    let cancelled = false;
    const res = await resolve(new Request(ORIGIN + '/api/shows/resolve', { method: 'POST', body: JSON.stringify({ input: CHANNEL }) }),
      fetcher((url) => {
        urls.push(url);
        return urls.length === 1
          ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status })
          : new Response(feed());
      }));
    expect(await res.json()).toMatchObject({ kind: 'preview', preview: { channelId: CHANNEL, feedUrl: channelFeedUrl(CHANNEL) } });
    expect(urls).toEqual([channelFeedUrl(CHANNEL), channelFeedUrl(CHANNEL).replace('www.youtube.com', 'youtube.com')]);
    expect(cancelled).toBe(true);
  });
  it('limite le secours à une tentative et conserve les erreurs persistantes', async () => {
    let calls = 0;
    await expect(resolve(new Request(ORIGIN + '/api/shows/resolve', { method: 'POST', body: JSON.stringify({ input: CHANNEL }) }),
      fetcher(() => { calls++; return new Response('Indisponible', { status: 503 }); }))).rejects.toThrow(/HTTP 503/);
    expect(calls).toBe(2);
  });
  it.each([200, 304, 403, 429])('ne réessaie pas un flux HTTP %s', async (status) => {
    let calls = 0;
    const response = await fetchYoutubeFeed(channelFeedUrl(CHANNEL), {}, fetcher(() => {
      calls++; return new Response(null, { status });
    }));
    expect(response.status).toBe(status);
    expect(calls).toBe(1);
  });
});

describe('abonnement → collecte → préparation', () => {
  it('collecte via le secours officiel en conservant les en-têtes conditionnels', async () => {
    const cookie = await login(); const id = await subscribe(cookie);
    await env.DB.prepare('UPDATE shows SET etag = ? WHERE id = ?').bind('v1', id).run();
    const urls: string[] = [];
    const result = await collectNext(env, NOW, fetcher((url, init) => {
      urls.push(url);
      expect(new Headers(init?.headers).get('If-None-Match')).toBe('v1');
      return urls.length === 1 ? new Response(null, { status: 500 }) : new Response(feed(), { headers: { ETag: 'v2' } });
    }), id);
    expect(result).toMatchObject({ status: 'ok', newItems: 1 });
    expect(urls).toHaveLength(2);
    expect(await env.DB.prepare('SELECT etag, last_error FROM shows WHERE id = ?').bind(id).first()).toMatchObject({ etag: 'v2', last_error: null });
  });
  it('collecte et déduplique sans préparation automatique, puis filtre Explorer par source', async () => {
    const cookie = await login(); const id = await subscribe(cookie);
    const f = fetcher(() => new Response(feed(), { headers: { ETag: 'v1' } }));
    expect(await collectNext(env, NOW, f, id)).toMatchObject({ status: 'ok', newItems: 1 });
    expect(await collectNext(env, NOW + 1_800_000, f, id)).toMatchObject({ newItems: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM prepare_queue').first()).toMatchObject({ n: 0 });
    const result = await (await call('/api/explorer?sourceType=youtube', { cookie })).json<{ episodes: { id: string }[] }>();
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]).toMatchObject({ sourceType: 'youtube', videoId: VIDEO, showTitle: 'ARTE' });
    expect((await call('/api/explorer?sourceType=podcast', { cookie })).status).toBe(400);
    expect((await call('/api/explorer?sourceType=evil', { cookie })).status).toBe(400);
    expect((await call('/api/shows', { method: 'POST', cookie, body: { title: 'Autre nom', sourceType: 'youtube', channelId: CHANNEL,
      feedUrl: channelFeedUrl(CHANNEL), language: 'fr', category: 'news' } })).status).toBe(409);
  });
  it('envoie une demande YouTube identique au lien manuel, avec titre, langue et catégorie', async () => {
    const cookie = await login(); const id = await subscribe(cookie);
    await collectNext(env, NOW, fetcher(() => new Response(feed())), id);
    const ep = await env.DB.prepare('SELECT id FROM episodes LIMIT 1').first<{ id: string }>();
    const options = { faithful: true };
    const prepared = await call(`/api/episodes/${ep!.id}/prepare`, { method: 'POST', cookie, body: options });
    expect(prepared.status).toBe(201);
    expect(await prepared.json()).toMatchObject({ item: { kind: 'youtube', ref: VIDEO, title: 'Une vidéo & une idée' } });
    expect((await call('/api/sources/youtube', { method: 'POST', cookie, body: { url: `https://youtu.be/${VIDEO}`, options } })).status).toBe(200);
    const lease = await call('/atelier/queue/lease', { method: 'POST', pwa: false, headers, body: { owner: 'mac' } });
    expect(await lease.json()).toMatchObject({ item: { kind: 'youtube', source: { videoId: VIDEO, title: 'Une vidéo & une idée', language: 'fr', category: 'science' } } });
    const removed = await call(`/api/shows/${id}`, { method: 'DELETE', cookie });
    expect(removed.status).toBe(204);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM episodes').first()).toMatchObject({ n: 1 });
  });
  it('protège les vidéos sauvegardées lors du désabonnement', async () => {
    const cookie = await login(); const id = await subscribe(cookie);
    await collectNext(env, NOW, fetcher(() => new Response(feed(entry() + entry('aaaaaaaaaaa')))), id);
    await env.DB.prepare("UPDATE episodes SET state='saved' WHERE video_id=?").bind(VIDEO).run();
    await call(`/api/shows/${id}`, { method: 'DELETE', cookie });
    const saved = await (await call('/api/explorer?state=saved', { cookie })).json<{ episodes: unknown[] }>();
    expect(saved.episodes).toHaveLength(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM episodes').first()).toMatchObject({ n: 1 });
  });
  it('refuse une incohérence entre type, flux et identifiant de chaîne', async () => {
    const cookie = await login();
    for (const body of [
      { sourceType: 'youtube', feedUrl: 'https://evil.test/feed', channelId: CHANNEL },
      { sourceType: 'podcast', feedUrl: channelFeedUrl(CHANNEL) },
      { sourceType: 'youtube', feedUrl: channelFeedUrl(CHANNEL), channelId: 'fake' },
    ]) {
      expect((await call('/api/shows', { method: 'POST', cookie, body: { title: 'Test', category: 'news', language: 'fr', ...body } })).status).toBe(422);
    }
  });
});
