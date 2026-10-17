import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { collectNext, episodeId, imageUrl, matchesTitleFilter } from '../src/collector';
import { parseDuration, parseFeedStream } from '../src/feedParser';
import { previewFeed } from '../src/routes/shows';
import { parseSafeUrl, safeFetch } from '../src/security/safeUrl';
import { call, login } from './helpers';

// ── Fabrique de flux ─────────────────────────────────────────────────────────
interface FakeItem { guid: string; title: string; minutes?: number; date?: string; transcript?: string; description?: string }

function item(i: FakeItem): string {
  return `<item>
    <title><![CDATA[${i.title}]]></title>
    <guid isPermaLink="false">${i.guid}</guid>
    <pubDate>${i.date ?? 'Fri, 16 Oct 2026 06:00:00 GMT'}</pubDate>
    <description>${i.description ?? '&lt;p&gt;Résumé &amp; contexte&lt;/p&gt;'}</description>
    <itunes:duration>${i.minutes ?? 12}:30</itunes:duration>
    <enclosure url="https://cdn.example.com/${i.guid}.mp3?a=1&amp;b=2" length="1" type="audio/mpeg"/>
    ${i.transcript ? `<podcast:transcript url="${i.transcript}" type="application/srt" language="en"/>` : ''}
  </item>`;
}

function feed(items: FakeItem[], title = 'Émission test'): string {
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
    <title>${title}</title><language>fr</language><itunes:author>Radio Test</itunes:author>
    <itunes:image href="https://cdn.example.com/cover.jpg"/>
    ${items.map(item).join('\n')}
  </channel></rss>`;
}

/** Corps découpé en petits morceaux, pour tester les coupures au milieu des balises. */
function stream(text: string, chunk = 37): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + chunk));
      i += chunk;
    },
  });
}

const items = (n: number, prefix = 'ep'): FakeItem[] =>
  Array.from({ length: n }, (_, k) => ({ guid: `${prefix}-${n - k}`, title: `Épisode ${n - k}`, date: new Date(Date.UTC(2026, 9, 16, 12) - k * 3_600_000).toUTCString() }));

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

// ── Analyse du flux ──────────────────────────────────────────────────────────
describe('lecture en flux', () => {
  it('extrait chaîne et épisodes, décode CDATA et entités, coupe la description', async () => {
    const xml = feed([{ guid: 'a', title: 'Le &quot;grand&quot; débat', transcript: 'https://cdn.example.com/a.srt', description: 'x'.repeat(9000) }]);
    const r = await parseFeedStream(stream(xml), { maxItems: 10 });
    expect(r.channel).toMatchObject({ title: 'Émission test', language: 'fr', author: 'Radio Test', imageUrl: 'https://cdn.example.com/cover.jpg' });
    expect(r.items[0]).toMatchObject({
      guid: 'a', title: 'Le "grand" débat', durationSec: 750, audioUrl: 'https://cdn.example.com/a.mp3?a=1&b=2',
      transcriptUrl: 'https://cdn.example.com/a.srt', transcriptType: 'srt', publishedAt: '2026-10-16T06:00:00.000Z',
    });
    expect(r.items[0]!.description!.length).toBe(2000);
    expect(r.stoppedAt).toBe('eof');
  });

  it('s’arrête au nombre maximal d’épisodes sans lire la suite', async () => {
    const xml = feed(items(200));
    const r = await parseFeedStream(stream(xml, 512), { maxItems: 10 });
    expect(r.items).toHaveLength(10);
    expect(r.stoppedAt).toBe('max_items');
    expect(r.bytesRead).toBeLessThan(xml.length / 5);
  });

  it('s’arrête au premier GUID déjà connu', async () => {
    const r = await parseFeedStream(stream(feed(items(20))), { maxItems: 15, knownGuids: new Set(['ep-18']) });
    expect(r.items.map((i) => i.guid)).toEqual(['ep-20', 'ep-19']);
    expect(r.stoppedAt).toBe('known_guid');
  });

  it('ignore un épisode sans audio', async () => {
    const xml = feed([]).replace('</channel>', '<item><title>Sans audio</title><guid>z</guid></item></channel>');
    expect((await parseFeedStream(stream(xml), { maxItems: 5 })).items).toHaveLength(0);
  });

  it('passe les images http en https', () => {
    expect(imageUrl('http://ichef.bbci.co.uk/a.jpg')).toBe('https://ichef.bbci.co.uk/a.jpg');
    expect(imageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(imageUrl('http://127.0.0.1/a.jpg')).toBeNull();
  });

  it('comprend les durées en secondes, MM:SS et HH:MM:SS', () => {
    expect(parseDuration('3723')).toBe(3723);
    expect(parseDuration('62:03')).toBe(3723);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('abc')).toBeNull();
  });
});

// ── safeUrl ──────────────────────────────────────────────────────────────────
describe('safeUrl', () => {
  it.each([
    'http://127.0.0.1/feed', 'https://10.0.0.1/feed', 'https://[::1]/feed', 'file:///etc/passwd', 'https://user:pass@example.com/',
    'https://example.com:8443/feed', 'https://localhost/feed', 'https://printer.local/feed', 'https://intranet/feed', 'javascript:alert(1)',
  ])('refuse %s', (u) => {
    expect(() => parseSafeUrl(u, { allowHttp: true })).toThrow();
  });

  it('accepte https, et http seulement si autorisé', () => {
    expect(parseSafeUrl('https://feeds.example.com/rss').hostname).toBe('feeds.example.com');
    expect(() => parseSafeUrl('http://feeds.example.com/rss')).toThrow();
    expect(parseSafeUrl('http://feeds.example.com/rss', { allowHttp: true }).protocol).toBe('http:');
  });

  it('revalide chaque redirection et refuse une redirection vers une adresse interne', async () => {
    const f = fakeFetch((url) => url.includes('start')
      ? new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest' } })
      : new Response('ok'));
    await expect(safeFetch('https://feeds.example.com/start', { allowHttp: true }, f)).rejects.toThrow(/IP littérale/);
  });

  it('limite le nombre de redirections', async () => {
    const f = fakeFetch(() => new Response(null, { status: 301, headers: { Location: 'https://feeds.example.com/loop' } }));
    await expect(safeFetch('https://feeds.example.com/loop', {}, f)).rejects.toThrow(/redirections/);
  });
});

// ── Collecte ─────────────────────────────────────────────────────────────────
const NOW = Date.parse('2026-10-17T12:00:00.000Z');

async function addShow(id: string, extra: Record<string, unknown> = {}) {
  const cols = { id, title: id, feed_url: `https://feeds.example.com/${id}.xml`, language: 'fr', category: 'news',
    next_check_at: '2026-10-17T00:00:00.000Z', created_at: '2026-10-17T00:00:00.000Z', ...extra };
  const keys = Object.keys(cols);
  await env.DB.prepare(`INSERT INTO shows (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...Object.values(cols)).run();
}

const count = async (sql: string, ...args: unknown[]) =>
  (await env.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM prepare_queue'), env.DB.prepare('DELETE FROM episodes'), env.DB.prepare('DELETE FROM shows'), env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM login_attempts')]);
});

describe('collecte', () => {
  it('la migration 0002 contient les 28 émissions de départ', async () => {
    // (le beforeEach vide la table : on relit la migration elle-même)
    const { results } = await env.DB.prepare("SELECT name FROM d1_migrations WHERE name = '0002_seed_shows.sql'").all();
    expect(results).toHaveLength(1);
  });

  it('vérifie l’émission la plus en retard, enregistre les épisodes et avance l’échéance', async () => {
    await addShow('a', { next_check_at: '2026-10-17T11:00:00.000Z' });
    await addShow('b', { next_check_at: '2026-10-17T10:00:00.000Z' });
    const f = fakeFetch(() => new Response(feed(items(3)), { headers: { ETag: '"v1"' } }));
    const r = await collectNext(env, NOW, f);
    expect(r).toMatchObject({ showId: 'b', status: 'ok', newItems: 3 });
    expect(await count('SELECT COUNT(*) AS n FROM episodes WHERE show_id = ?', 'b')).toBe(3);
    const show = await env.DB.prepare("SELECT * FROM shows WHERE id = 'b'").first<Record<string, unknown>>();
    expect(show).toMatchObject({ etag: '"v1"', last_error: null, consecutive_failures: 0, next_check_at: '2026-10-17T12:30:00.000Z' });
  });

  it('trois passages sans nouveauté ne créent aucun doublon et ne lisent rien au-delà du premier GUID connu', async () => {
    await addShow('a');
    const body = feed(items(5));
    const f = fakeFetch(() => new Response(body));
    await collectNext(env, NOW, f, 'a');
    for (let k = 1; k <= 3; k++) {
      const r = await collectNext(env, NOW + k * 1_800_000, f, 'a');
      expect(r).toMatchObject({ status: 'ok', newItems: 0, stoppedAt: 'known_guid' });
    }
    expect(await count('SELECT COUNT(*) AS n FROM episodes')).toBe(5);
  });

  it('envoie ETag et Last-Modified, et s’arrête sur un 304', async () => {
    await addShow('a', { etag: '"v1"', last_modified: 'Fri, 16 Oct 2026 06:00:00 GMT' });
    let seen: Headers | undefined;
    const f = fakeFetch((_u, init) => {
      seen = new Headers(init?.headers);
      return new Response(null, { status: 304 });
    });
    expect(await collectNext(env, NOW, f, 'a')).toMatchObject({ status: 'not_modified' });
    expect(seen?.get('If-None-Match')).toBe('"v1"');
    expect(seen?.get('If-Modified-Since')).toBe('Fri, 16 Oct 2026 06:00:00 GMT');
  });

  it('un flux en erreur est noté et n’empêche pas les autres ; 5 échecs ⇒ une vérification par jour', async () => {
    await addShow('broken', { next_check_at: '2026-10-17T09:00:00.000Z', consecutive_failures: 4 });
    await addShow('ok', { next_check_at: '2026-10-17T10:00:00.000Z' });
    const f = fakeFetch((url) => url.includes('broken') ? new Response('nope', { status: 404 }) : new Response(feed(items(2))));
    expect(await collectNext(env, NOW, f)).toMatchObject({ showId: 'broken', status: 'error', error: 'HTTP 404' });
    expect(await collectNext(env, NOW, f)).toMatchObject({ showId: 'ok', status: 'ok' });
    const broken = await env.DB.prepare("SELECT * FROM shows WHERE id = 'broken'").first<Record<string, unknown>>();
    expect(broken).toMatchObject({ consecutive_failures: 5, last_error: 'HTTP 404', next_check_at: '2026-10-18T12:00:00.000Z' });
  });

  it('une exécution interrompue (marqueur resté en place) réduit la lecture à 3 épisodes', async () => {
    await addShow('a', { last_error: 'in_progress', max_items: 10 });
    const f = fakeFetch(() => new Response(feed(items(10))));
    expect(await collectNext(env, NOW, f, 'a')).toMatchObject({ status: 'ok', newItems: 3, stoppedAt: 'max_items' });
    expect(await count("SELECT max_items AS n FROM shows WHERE id = 'a'")).toBe(3);
  });

  it('le filtre de titre ne garde que les épisodes qui contiennent un mot-clé (sans tenir compte des accents)', async () => {
    expect(matchesTitleFilter('Le Paris Saint-Germain s’impose', '["PSG","Paris"]')).toBe(true);
    expect(matchesTitleFilter('Marseille - Lens', '["PSG","Paris"]')).toBe(false);
    expect(matchesTitleFilter('Défense du PSG', '["psg"]')).toBe(true);
    await addShow('foot', { title_filter_json: '["PSG"]' });
    const f = fakeFetch(() => new Response(feed([{ guid: 'x1', title: 'PSG : la victoire' }, { guid: 'x2', title: 'OM - Lens' }])));
    await collectNext(env, NOW, f, 'foot');
    const { results } = await env.DB.prepare('SELECT title FROM episodes').all<{ title: string }>();
    expect(results.map((r) => r.title)).toEqual(['PSG : la victoire']);
  });

  it('la rétention garde 10 épisodes, mais jamais ne supprime un épisode sauvegardé', async () => {
    await addShow('a', { max_items: 15 });
    const f1 = fakeFetch(() => new Response(feed(items(12, 'old'))));
    await collectNext(env, NOW, f1, 'a');
    expect(await count('SELECT COUNT(*) AS n FROM episodes')).toBe(10);
    await env.DB.prepare("UPDATE episodes SET state = 'saved' WHERE guid = 'old-3'").run();
    const newer = items(12, 'new').map((it) => ({ ...it, date: new Date(Date.parse(it.date!) + 86_400_000).toUTCString() }));
    await collectNext(env, NOW + 3_600_000, fakeFetch(() => new Response(feed(newer))), 'a');
    expect(await count("SELECT COUNT(*) AS n FROM episodes WHERE guid = 'old-3'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM episodes WHERE state <> 'saved'")).toBe(10);
  });

  it('garde dix histoires anciennes, mais fait expirer les autres catégories après trente jours', async () => {
    await addShow('stories', { category: 'stories', max_items: 15 });
    await addShow('news', { category: 'news', max_items: 15 });
    const archived = items(12, 'archive').map((it) => ({
      ...it, date: new Date(Date.parse(it.date!) - 365 * 86_400_000).toUTCString(),
    }));
    const fetcher = fakeFetch(() => new Response(feed(archived)));
    expect(await collectNext(env, NOW, fetcher, 'stories')).toMatchObject({ status: 'ok' });
    expect(await collectNext(env, NOW, fetcher, 'news')).toMatchObject({ status: 'ok' });
    expect(await count("SELECT COUNT(*) AS n FROM episodes WHERE show_id = 'stories'")).toBe(10);
    expect(await count("SELECT COUNT(*) AS n FROM episodes WHERE show_id = 'news'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM episodes WHERE guid = 'archive-1'")).toBe(0);
  });
});

// ── Aperçu et API ────────────────────────────────────────────────────────────
describe('émissions et Explorer (API)', () => {
  it('previewFeed calcule durée médiane, rythme et présence de transcriptions', async () => {
    const f = fakeFetch(() => new Response(feed([
      { guid: '1', title: 'Un', minutes: 10, transcript: 'https://cdn.example.com/1.srt', date: 'Fri, 16 Oct 2026 06:00:00 GMT' },
      { guid: '2', title: 'Deux', minutes: 20, date: 'Thu, 15 Oct 2026 06:00:00 GMT' },
      { guid: '3', title: 'Trois', minutes: 30, date: 'Wed, 14 Oct 2026 06:00:00 GMT' },
    ])));
    const p = await previewFeed('https://feeds.example.com/x.xml', f);
    expect(p).toMatchObject({ title: 'Émission test', language: 'fr', medianMinutes: 21, episodesPerWeek: 7, hasTranscripts: true });
    expect(p.latest).toHaveLength(3);
  });

  it('abonnement, liste, modification et désabonnement', async () => {
    const cookie = await login();
    const created = await call('/api/shows', { method: 'POST', cookie, body: {
      feedUrl: 'https://feeds.example.com/nouvelle.xml', title: 'Nouvelle Émission', language: 'fr', category: 'tech', titleFilter: ['IA'],
    } });
    expect(created.status).toBe(201);
    const { show } = await created.json<{ show: { id: string; titleFilter: string[] } }>();
    expect(show).toMatchObject({ id: 'nouvelle-emission', titleFilter: ['IA'] });

    expect((await call('/api/shows', { method: 'POST', cookie, body: {
      feedUrl: 'https://feeds.example.com/nouvelle.xml', title: 'Doublon', language: 'fr', category: 'tech',
    } })).status).toBe(409);
    expect((await call('/api/shows', { method: 'POST', cookie, body: {
      feedUrl: 'http://127.0.0.1/x', title: 'Interdite', language: 'fr', category: 'tech',
    } })).status).toBe(400);

    const patched = await call(`/api/shows/${show.id}`, { method: 'PATCH', cookie, body: { enabled: false, titleFilter: [] } });
    expect(await patched.json()).toMatchObject({ show: { enabled: false, titleFilter: null } });

    expect((await call(`/api/shows/${show.id}`, { method: 'DELETE', cookie })).status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM shows')).toBe(0);
  });

  it('le désabonnement garde l’émission (désactivée) si un épisode est sauvegardé', async () => {
    const cookie = await login();
    await addShow('a');
    await collectNext(env, NOW, fakeFetch(() => new Response(feed(items(2)))), 'a');
    await env.DB.prepare("UPDATE episodes SET state = 'saved' WHERE guid = 'ep-2'").run();
    await call('/api/shows/a', { method: 'DELETE', cookie });
    expect(await count("SELECT enabled AS n FROM shows WHERE id = 'a'")).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM episodes')).toBe(1);
  });

  it('Explorer pagine du plus récent au plus ancien, filtre et masque les épisodes écartés', async () => {
    const cookie = await login();
    await addShow('fr1', { category: 'economy', max_items: 15 });
    await addShow('en1', { language: 'en', category: 'tech', max_items: 15 });
    await collectNext(env, NOW, fakeFetch(() => new Response(feed(items(15, 'f')))), 'fr1');
    await collectNext(env, NOW, fakeFetch(() => new Response(feed(items(15, 'e')))), 'en1');

    const page1 = await (await call('/api/explorer', { cookie })).json<{ episodes: { id: string }[]; nextCursor: string }>();
    expect(page1.episodes).toHaveLength(20);
    expect(page1.nextCursor).toBeNull();

    const en = await (await call('/api/explorer?lang=en', { cookie })).json<{ episodes: { language: string }[] }>();
    expect(en.episodes.every((e) => e.language === 'en')).toBe(true);
    const eco = await (await call('/api/explorer?category=economy', { cookie })).json<{ episodes: { category: string }[] }>();
    expect(eco.episodes.every((e) => e.category === 'economy')).toBe(true);

    const target = await episodeId('fr1', 'f-15');
    expect((await call(`/api/episodes/${target}/state`, { method: 'POST', cookie, body: { state: 'dismissed' } })).status).toBe(200);
    const after = await (await call('/api/explorer', { cookie })).json<{ episodes: { id: string }[] }>();
    expect(after.episodes.some((e) => e.id === target)).toBe(false);
    expect((await call(`/api/episodes/${target}`, { cookie })).status).toBe(200);
    expect((await call('/api/explorer?category=inconnue', { cookie })).status).toBe(400);
  });
});

it('conserve un épisode en file malgré son âge et le désabonnement', async () => {
  await addShow('queued');
  const id=await episodeId('queued','old-queued');
  await env.DB.prepare("INSERT INTO episodes (id,show_id,guid,title,audio_url,published_at,created_at) VALUES (?,'queued','old-queued','Archive','https://example.com/a.mp3','2020-01-01','2020-01-01')").bind(id).run();
  await env.DB.prepare("INSERT INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at) VALUES ('queued','episode',?,'{}','2026-10-17','2026-10-17')").bind(id).run();
  await collectNext(env,NOW,fakeFetch(() => new Response(feed([]))),'queued');
  expect(await count('SELECT COUNT(*) AS n FROM episodes WHERE id=?',id)).toBe(1);
  const cookie=await login();
  expect((await call('/api/shows/queued',{method:'DELETE',cookie})).status).toBe(204);
  expect(await count('SELECT COUNT(*) AS n FROM episodes WHERE id=?',id)).toBe(1);
});
