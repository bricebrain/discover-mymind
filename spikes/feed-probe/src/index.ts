import seed from './seed-shows.json';

interface Show { id: string; feedUrl: string }
const SHOWS = (seed as { shows: Show[] }).shows;
const UA = 'discover-feed-probe/0.1 (+personal podcast reader)';

interface Item { guid: string | null; title: string | null; audioUrl: string | null; duration: string | null; pubDate: string | null; transcript: string | null }

function tag(chunk: string, name: string): string | null {
  const m = chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return null;
  return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
}
function attr(chunk: string, name: string, a: string): string | null {
  const m = chunk.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`));
  return m ? m[1].replace(/&amp;/g, '&') : null;
}
function extract(chunk: string): Item {
  return {
    guid: tag(chunk, 'guid'), title: tag(chunk, 'title'), audioUrl: attr(chunk, 'enclosure', 'url'),
    duration: tag(chunk, 'itunes:duration'), pubDate: tag(chunk, 'pubDate'), transcript: attr(chunk, 'podcast:transcript', 'url'),
  };
}

/** Lecture en flux : s'arrête après maxItems épisodes, sans lire la suite du fichier. */
async function streamItems(res: Response, maxItems: number) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '', bytes = 0;
  const items: Item[] = [];
  outer: while (items.length < maxItems) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const start = buf.search(/<item[\s>]/);
      if (start === -1) { buf = buf.slice(-16); break; }
      const end = buf.indexOf('</item>', start);
      if (end === -1) { buf = buf.slice(start); break; }
      items.push(extract(buf.slice(start, end)));
      buf = buf.slice(end + 7);
      if (items.length >= maxItems) break outer;
    }
  }
  await reader.cancel().catch(() => {});
  return { items, bytes };
}

/** Approche naïve : télécharge et analyse tout le flux. */
async function fullItems(res: Response) {
  const text = await res.text();
  const items = [...text.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m) => extract(m[0]));
  return { items: items.slice(0, 15), total: items.length, bytes: text.length };
}

async function probe(show: Show, mode: string) {
  const t0 = Date.now();
  const res = await fetch(show.feedUrl, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' } });
  const out: Record<string, unknown> = { id: show.id, status: res.status, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
  if (!res.ok) { await res.body?.cancel(); return out; }
  if (mode === 'full') {
    const r = await fullItems(res);
    Object.assign(out, { bytes: r.bytes, totalItems: r.total, items: r.items.length });
  } else {
    const r = await streamItems(res, 15);
    Object.assign(out, { bytes: r.bytes, items: r.items.length, withAudio: r.items.filter((i) => i.audioUrl).length, withGuid: r.items.filter((i) => i.guid).length, transcripts: r.items.filter((i) => i.transcript).length, first: r.items[0]?.title?.slice(0, 60) });
  }
  if (mode === 'cond' && (out.etag || out.lastModified)) {
    const h: Record<string, string> = { 'User-Agent': UA };
    if (out.etag) h['If-None-Match'] = out.etag as string;
    if (out.lastModified) h['If-Modified-Since'] = out.lastModified as string;
    const r2 = await fetch(show.feedUrl, { headers: h });
    out.conditionalStatus = r2.status;
    await r2.body?.cancel();
  }
  out.wallMs = Date.now() - t0;
  return out;
}

export default {
  async fetch(req: Request, env: { PROBE_TOKEN: string }): Promise<Response> {
    const url = new URL(req.url);
    if (url.searchParams.get('t') !== env.PROBE_TOKEN) return new Response('forbidden', { status: 403 });
    const mode = url.searchParams.get('mode') ?? 'stream';
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    const shows = SHOWS.filter((s) => ids.includes(s.id));
    const results = [];
    for (const s of shows) {
      try { results.push(await probe(s, mode)); } catch (e) { results.push({ id: s.id, error: String(e) }); }
    }
    console.log(JSON.stringify({ probe: mode, ids }));
    return Response.json(results);
  },
};
