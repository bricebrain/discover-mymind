import type { Env } from '../env';
import { USER_AGENT } from '../collector';
import { sha256Hex } from '../security/crypto';
import { safeFetch } from '../security/safeUrl';
import { parseArticleFeed } from './feed';
import { ARTICLE_WAITING_FOR_DOSSIER, cleanupCollectedItems, collectionCutoff } from '../retention';

const CHECK_EVERY_MS = 60 * 60_000;
const MAX_BYTES = 1_500_000;
const KEEP_PER_SOURCE = 60;
const NEW_PER_RUN = 6;

async function readCapped(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= MAX_BYTES) { await reader.cancel(); break; }
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** Vérifie la source d'articles la plus en retard (une par appel), à intégrer au cron. */
export async function collectArticles(env: Env, now = Date.now(), fetcher: typeof fetch = fetch) {
  await cleanupCollectedItems(env, now);
  const cutoff = await collectionCutoff(env, now);
  const iso = new Date(now).toISOString();
  const source = await env.DB.prepare("SELECT id, feed_url FROM article_sources WHERE enabled=1 AND feed_url<>'' AND next_check_at<=? ORDER BY next_check_at LIMIT 1")
    .bind(iso).first<{ id: string; feed_url: string }>();
  if (!source) return { status: 'idle' as const };
  await env.DB.prepare('UPDATE article_sources SET next_check_at=? WHERE id=?').bind(new Date(now + CHECK_EVERY_MS).toISOString(), source.id).run();
  try {
    // Les flux officiels Maxifoot sont disponibles uniquement en HTTP.
    const allowHttp = source.feed_url.startsWith('http://rss.maxifoot.com/');
    const res = await safeFetch(source.feed_url, { allowHttp, headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9' } }, fetcher);
    if (!res.ok || !res.body) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    const { results: known } = await env.DB.prepare('SELECT guid FROM articles WHERE source_id=? ORDER BY published_at DESC LIMIT 80').bind(source.id).all<{ guid: string }>();
    const items = parseArticleFeed(await readCapped(res), NEW_PER_RUN, new Set(known.map((k) => k.guid)), now)
      .filter(item => Date.parse(item.publishedAt!) >= cutoff);
    const statements = [];
    for (const it of items) {
      const id = (await sha256Hex(`${source.id}|${it.guid}`)).slice(0, 20);
      statements.push(env.DB.prepare(`INSERT INTO articles (id,source_id,guid,url,title,summary,author,published_at,content_text,content_status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,guid) DO NOTHING`)
        .bind(id, source.id, it.guid, it.url, it.title, it.summary, it.author, it.publishedAt ?? iso, it.content, it.content ? 'feed' : 'none', iso));
    }
    statements.push(
      env.DB.prepare(`DELETE FROM articles WHERE source_id=? AND reflection_id IS NULL AND NOT ${ARTICLE_WAITING_FOR_DOSSIER} AND id NOT IN
        (SELECT id FROM articles WHERE source_id=? ORDER BY published_at DESC LIMIT ?)`).bind(source.id, source.id, KEEP_PER_SOURCE),
      env.DB.prepare('UPDATE article_sources SET last_success_at=?, last_error=NULL WHERE id=?').bind(iso, source.id),
    );
    await env.DB.batch(statements);
    return { status: 'ok' as const, sourceId: source.id, items: items.length };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    await env.DB.prepare('UPDATE article_sources SET last_error=? WHERE id=?').bind(message, source.id).run();
    return { status: 'error' as const, sourceId: source.id, message };
  }
}
