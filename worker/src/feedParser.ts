/**
 * Lecture en flux d'un flux Atom de chaîne YouTube (§ 7.1) : on analyse les <entry> au fil de l'eau
 * et on arrête dès que c'est suffisant (nombre de vidéos, GUID déjà connu, plafond
 * d'octets). Extraction par indexOf : le pire cas mesuré venait des expressions
 * régulières appliquées à de très longues descriptions.
 * Les flux RSS de podcasts ne sont plus lus (Discover suit seulement YouTube depuis le 21 octobre 2026).
 */

export interface ChannelInfo {
  title: string | null;
  author: string | null;
  language: string | null;
  imageUrl: string | null;
}

export interface FeedItem {
  videoId?: string;
  guid: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  audioUrl: string;
  imageUrl: string | null;
}

export type StopReason = 'max_items' | 'known_guid' | 'eof' | 'max_bytes';

export interface ParseResult {
  channel: ChannelInfo | null;
  items: FeedItem[];
  bytesRead: number;
  stoppedAt: StopReason;
}

export interface ParseOptions {
  maxItems: number;
  knownGuids?: ReadonlySet<string>;
  maxBytes?: number;
  acceptItem?: (item: FeedItem) => boolean;
  atom: { parseItem: (xml: string) => FeedItem | null; parseChannel: (xml: string) => ChannelInfo };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function unwrapCdata(s: string): string {
  const t = s.trim();
  return t.startsWith('<![CDATA[') && t.endsWith(']]>') ? t.slice(9, -3) : t;
}

/** Contenu brut de la première balise `name` (sans les balises), ou null. */
export function rawTag(chunk: string, name: string, maxLen = Infinity): string | null {
  let from = 0;
  for (;;) {
    const open = chunk.indexOf(`<${name}`, from);
    if (open === -1) return null;
    const after = chunk.charCodeAt(open + name.length + 1);
    // '>' (62), espace, tabulation, retour à la ligne ou '/' : sinon c'est une autre balise (ex. <titleX>)
    if (after !== 62 && after !== 32 && after !== 9 && after !== 10 && after !== 13 && after !== 47) {
      from = open + 1;
      continue;
    }
    const gt = chunk.indexOf('>', open);
    if (gt === -1) return null;
    if (chunk[gt - 1] === '/') return ''; // balise autofermante
    const close = chunk.indexOf(`</${name}>`, gt);
    if (close === -1) return null;
    return chunk.slice(gt + 1, Math.min(close, gt + 1 + maxLen));
  }
}

export function text(chunk: string, name: string, maxLen?: number): string | null {
  const raw = rawTag(chunk, name, maxLen);
  if (raw === null) return null;
  const v = decodeEntities(unwrapCdata(raw)).trim();
  return v || null;
}

/** Valeur de l'attribut `attr` de la première balise `name` qui le porte. */
export function attrOf(tagSource: string, attr: string): string | null {
  const key = ` ${attr}=`;
  const i = tagSource.indexOf(key);
  if (i === -1) return null;
  const quote = tagSource[i + key.length];
  if (quote !== '"' && quote !== "'") return null;
  const end = tagSource.indexOf(quote, i + key.length + 1);
  return end === -1 ? null : decodeEntities(tagSource.slice(i + key.length + 1, end)).trim() || null;
}

/** Toutes les balises ouvrantes `<name …>` du morceau (source de la balise seulement). */
export function openTags(chunk: string, name: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = chunk.indexOf(`<${name}`, from);
    if (i === -1) return out;
    const gt = chunk.indexOf('>', i);
    if (gt === -1) return out;
    out.push(chunk.slice(i, gt + 1).replace(/\s+/g, ' '));
    from = gt + 1;
  }
}

export function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseDate(v: string | null): string | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function parseFeedStream(body: ReadableStream<Uint8Array>, opts: ParseOptions): Promise<ParseResult> {
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const itemOpen = /<entry[\s>]/;
  const itemClose = '</entry>';
  const channelParser = opts.atom.parseChannel;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let bytesRead = 0;
  let channel: ChannelInfo | null = null;
  let headerBuf = '';
  const items: FeedItem[] = [];
  let stoppedAt: StopReason = 'eof';

  try {
    outer: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const start = buf.search(itemOpen);
        if (start === -1) {
          if (!channel && headerBuf.length < 64_000) headerBuf += buf.length > 16 ? buf.slice(0, -16) : '';
          buf = buf.slice(-16);
          break;
        }
        if (!channel) channel = channelParser(headerBuf + buf.slice(0, start));
        const end = buf.indexOf(itemClose, start);
        if (end === -1) {
          buf = buf.slice(start);
          break;
        }
        const item = opts.atom.parseItem(buf.slice(start, end));
        buf = buf.slice(end + itemClose.length);
        if (item) {
          if (opts.knownGuids?.has(item.guid)) {
            stoppedAt = 'known_guid';
            break outer;
          }
          if (opts.acceptItem && !opts.acceptItem(item)) continue;
          items.push(item);
          if (items.length >= opts.maxItems) {
            stoppedAt = 'max_items';
            break outer;
          }
        }
      }
      if (bytesRead >= maxBytes) {
        stoppedAt = 'max_bytes';
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { channel: channel ?? (headerBuf ? channelParser(headerBuf) : null), items, bytesRead, stoppedAt };
}
