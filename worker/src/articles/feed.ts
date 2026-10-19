/** Flux d'articles RSS 2.0 ou Atom : quelques champs par entrée, texte complet quand le flux le fournit. */
export interface ArticleItem { guid: string; url: string; title: string; summary: string | null; author: string | null; publishedAt: string | null; content: string | null }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', mdash: '—', ndash: '–' };
export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const unwrap = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');

/** HTML → texte lisible : un paragraphe par ligne vide, sans balise ni script. */
export function htmlToText(input: string): string {
  const html = decode(unwrap(input)).replace(/<(script|style|figure|figcaption|aside|iframe)[\s\S]*?<\/\1>/gi, '');
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '');
  return decode(text).split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1]! : null;
}
function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]!);
  const alt = links.find((a) => !/rel=/.test(a) || /rel=["']alternate["']/.test(a)) ?? links[0];
  return alt ? /href=["']([^"']+)["']/.exec(alt)?.[1] ?? null : null;
}
const isoDate = (raw: string | null) => { if (!raw) return null; const t = Date.parse(decode(unwrap(raw)).trim()); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const plain = (raw: string | null, max: number) => (raw ? htmlToText(raw).slice(0, max) || null : null);

/**
 * `known` : identifiants déjà en base, écartés AVANT toute conversion (le Worker gratuit n'a que 10 ms de calcul) ;
 * au plus `maxItems` nouveaux articles convertis par passage, les suivants viendront au prochain.
 */
export function parseArticleFeed(xml: string, maxItems = 20, known: Set<string> = new Set()): ArticleItem[] {
  const items: ArticleItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if (items.length >= maxItems) break;
    const b = m[2]!;
    const atom = m[1]!.toLowerCase() === 'entry';
    const url = decode(unwrap((atom ? atomLink(b) : tag(b, 'link')) ?? '').trim());
    if (!url || !/^https?:\/\//.test(url)) continue;
    const guid = decode(unwrap(tag(b, atom ? 'id' : 'guid') ?? url).trim()).slice(0, 500) || url;
    if (known.has(guid)) continue;
    const title = plain(tag(b, 'title'), 300);
    if (!title) continue;
    const content = plain(tag(b, 'content:encoded') ?? (atom ? tag(b, 'content') : null), 100_000);
    items.push({
      guid, url: url.slice(0, 2048), title,
      summary: plain(tag(b, atom ? 'summary' : 'description'), 1200),
      author: plain(tag(b, 'dc:creator') ?? tag(tag(b, 'author') ?? '', 'name') ?? tag(b, 'author'), 200),
      publishedAt: isoDate(tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date')),
      // Un « contenu » à peine plus long que le résumé n'est pas l'article complet.
      content: content && content.length >= 1500 ? content : null,
    });
  }
  return items;
}
