import { env } from 'cloudflare:workers';
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanupCollectedItems, isRecentItem, ITEM_RETENTION_MS } from '../src/retention';
import { automaticPreparation } from '../src/queue/automatic';
import { collectNext } from '../src/collector';
import { collectArticles } from '../src/articles/collect';
import { parseArticleFeed } from '../src/articles/feed';
import { call, ATELIER_TOKEN } from './helpers';

const now = Date.parse('2026-10-24T12:00:00.000Z');
const cutoff = new Date(now - ITEM_RETENTION_MS).toISOString();
const stale = new Date(now - ITEM_RETENTION_MS - 1).toISOString();
const at = new Date(now).toISOString();

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM prepare_queue'),
    env.DB.prepare('DELETE FROM episodes'),
    env.DB.prepare('DELETE FROM articles'),
    env.DB.prepare('DELETE FROM shows'),
    env.DB.prepare(`INSERT INTO shows (id,title,feed_url,language,category,source_type,auto_prepare,next_check_at,created_at)
      VALUES ('retention','Test','https://example.com/feed','fr','news','youtube',1,?,?)`).bind(at, at),
  ]);
});

async function episode(id: string, date: string | null, state = 'new', created = at) {
  await env.DB.prepare(`INSERT INTO episodes (id,show_id,guid,title,audio_url,published_at,created_at,video_id,state)
    VALUES (?,'retention',?,'Titre','https://www.youtube.com/watch?v=abcdefghijk',?,?,?,?)`)
    .bind(id, id, date, created, id.padEnd(11, '_'), state).run();
}
async function queued(id: string, status = 'pending', expires: string | null = null) {
  await env.DB.prepare(`INSERT INTO prepare_queue (id,kind,ref,options_json,status,lease_expires_at,created_at,updated_at)
    VALUES (?,'youtube',?,'{}',?,?,?,?)`).bind(id, id.padEnd(11, '_'), status, expires, at, at).run();
}
const ids = async () => (await env.DB.prepare('SELECT id FROM episodes ORDER BY id').all<{id: string}>()).results.map(r => r.id);

it('accepte exactement 24 h et refuse dates absentes, invalides ou futures', () => {
  expect(isRecentItem(cutoff, now)).toBe(true);
  for (const date of [stale, null, 'invalide', new Date(now + 1).toISOString()]) expect(isRecentItem(date, now)).toBe(false);
});

it('purge les anciennes sources, conserve sauvegardes, contenus préparés, notes et baux actifs', async () => {
  await episode('boundary', cutoff);
  await episode('old', stale);
  await episode('saved', stale, 'saved');
  await episode('active', stale);
  await episode('expired', stale);
  await episode('prepared', stale);
  await episode('undated', null, 'new', stale);
  await env.DB.prepare(`INSERT INTO contents (id,title,original_language,source_type,created_at,updated_at)
    VALUES ('prepared-content','Préparé','fr','youtube',?,?)`).bind(at, at).run();
  await env.DB.prepare("UPDATE episodes SET content_id='prepared-content' WHERE id='prepared'").run();
  await queued('old');
  await queued('active', 'leased', new Date(now + 60_000).toISOString());
  await queued('expired', 'leased', stale);
  for (const [id, date, note] of [['old', stale, null], ['boundary', cutoff, null], ['note', stale, 'my-note']]) {
    await env.DB.prepare(`INSERT INTO articles (id,source_id,guid,url,title,published_at,created_at,reflection_id)
      VALUES (?,'guardian-world',?,'https://example.com/article','Article',?,?,?)`).bind(id, id, date, at, note).run();
  }
  await cleanupCollectedItems(env, now);
  expect(await ids()).toEqual(['active', 'boundary', 'prepared', 'saved']);
  expect((await env.DB.prepare('SELECT id,status FROM prepare_queue ORDER BY id').all()).results).toEqual([
    { id: 'active', status: 'leased' }, { id: 'expired', status: 'cancelled' }, { id: 'old', status: 'cancelled' },
  ]);
  expect((await env.DB.prepare('SELECT id FROM articles ORDER BY id').all()).results).toEqual([{id:'boundary'}, {id:'note'}]);
  await cleanupCollectedItems(env, now);
  expect(await ids()).toEqual(['active', 'boundary', 'prepared', 'saved']);
});

it.each([304, 503])('nettoie les sources malgré un flux HTTP %s', async (status) => {
  await episode('old', stale);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {status}));
  await collectNext(env, now, fetcher, 'retention');
  expect(await ids()).toEqual([]);
});

it('nettoie même sans abonnement à collecter', async () => {
  await episode('old', stale);
  expect(await collectNext(env, now - 1)).toMatchObject({status:'idle'});
  // À now-1, la source est exactement sur la borne et reste conservée.
  expect(await ids()).toEqual(['old']);
  await collectNext(env, now + 1);
  expect(await ids()).toEqual([]);
});

it('ne prépare automatiquement que la dernière publication des 24 dernières heures', async () => {
  await episode('old', stale);
  await automaticPreparation(env, 'retention', now).run();
  expect((await env.DB.prepare('SELECT * FROM prepare_queue').all()).results).toHaveLength(0);
  await episode('boundary', cutoff);
  await automaticPreparation(env, 'retention', now).run();
  expect((await env.DB.prepare('SELECT ref FROM prepare_queue').all()).results).toEqual([{ref:'boundary___'}]);
});

it('filtre les articles avant la limite pour ne pas masquer les entrées récentes', () => {
  const entry = (id: string, date: string | null) => `<item><guid>${id}</guid><title>${id}</title><link>https://example.com/${id}</link>${date ? `<pubDate>${date}</pubDate>` : ''}</item>`;
  const xml = `<rss><channel>${entry('old', stale)}${entry('unknown', null)}${entry('future', new Date(now+1).toISOString())}${entry('recent', cutoff)}</channel></rss>`;
  expect(parseArticleFeed(xml, 1, new Set(), now).map(i => i.guid)).toEqual(['recent']);
});

it('une collecte d’articles anciens ne les réinsère pas en base', async () => {
  await env.DB.prepare("UPDATE article_sources SET next_check_at='2000-01-01'").run();
  const xml = `<rss><channel><item><title>Ancien</title><guid>old</guid><link>https://example.com/old</link><pubDate>${stale}</pubDate></item></channel></rss>`;
  expect(await collectArticles(env, now, vi.fn<typeof fetch>().mockResolvedValue(new Response(xml)))).toMatchObject({status:'ok', items:0});
  expect((await env.DB.prepare('SELECT * FROM articles').all()).results).toHaveLength(0);
});

it('annule la demande expirée avant de la confier au préparateur local', async () => {
  await episode('old', '2000-01-01T00:00:00.000Z');
  await queued('old');
  const response = await call('/atelier/queue/lease', {method:'POST', headers:{Authorization:`Bearer ${ATELIER_TOKEN}`}, body:{owner:'retention-test'}});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({item:null});
  expect(await env.DB.prepare("SELECT status FROM prepare_queue WHERE id='old'").first()).toEqual({status:'cancelled'});
});

it('filtre les vidéos anciennes, sans date ou futures avant la limite de collecte', async () => {
  await env.DB.prepare("UPDATE shows SET max_items=1 WHERE id='retention'").run();
  const entry = (id: string, date: string | null) => `<entry><yt:videoId>${id.padEnd(11,'_')}</yt:videoId><title>${id}</title>${date ? `<published>${date}</published>` : ''}</entry>`;
  const xml = `<feed><title>Test</title>${entry('old', stale)}${entry('unknown', null)}${entry('future', new Date(now+1).toISOString())}${entry('recent', cutoff)}</feed>`;
  const result = await collectNext(env, now, vi.fn<typeof fetch>().mockResolvedValue(new Response(xml)), 'retention');
  expect(result).toMatchObject({status:'ok', newItems:1});
  expect((await env.DB.prepare('SELECT title FROM episodes').all()).results).toEqual([{title:'recent'}]);
});

it('conserve une demande explicitement sauvegardée même après expiration', async () => {
  await episode('saved', stale, 'saved');
  await queued('saved');
  await cleanupCollectedItems(env, now);
  expect(await ids()).toEqual(['saved']);
  expect(await env.DB.prepare("SELECT status FROM prepare_queue WHERE id='saved'").first()).toEqual({status:'pending'});
});

it('garde un article expiré dont un dossier attend le texte complet', async () => {
  await env.DB.prepare(`INSERT INTO articles (id,source_id,guid,url,title,published_at,created_at)
    VALUES ('waiting','guardian-world','waiting','https://example.com/waiting','Article',?,?)`).bind(stale, at).run();
  const sources = JSON.stringify([{type:'article', ref:'waiting', contentStatus:'pending'}]);
  await env.DB.prepare(`INSERT INTO dossiers (id,title,sources_json,created_at,updated_at)
    VALUES ('retention-dossier','Titre',?,?,?)`).bind(sources,at,at).run();
  await env.DB.prepare(`INSERT INTO dossier_runs (id,dossier_id,version,title,sources_json,options_json,created_at)
    VALUES ('retention-run','retention-dossier',1,'Titre',?,'{}',?)`).bind(sources, at).run();
  await env.DB.prepare(`INSERT INTO prepare_queue (id,kind,ref,options_json,created_at,updated_at)
    VALUES ('retention-queue','dossier','retention-run','{}',?,?)`).bind(at, at).run();
  await cleanupCollectedItems(env, now);
  expect(await env.DB.prepare("SELECT id FROM articles WHERE id='waiting'").first()).toEqual({id:'waiting'});
  await env.DB.prepare("UPDATE dossier_runs SET sources_json=? WHERE id='retention-run'")
    .bind(JSON.stringify([{type:'article',ref:'waiting',contentStatus:'complete'}])).run();
  await cleanupCollectedItems(env, now);
  expect(await env.DB.prepare("SELECT id FROM articles WHERE id='waiting'").first()).toBeNull();
});
