import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectArticles } from '../src/articles/collect';
import { htmlToText, parseArticleFeed } from '../src/articles/feed';
import { ATELIER_TOKEN, call, login } from './helpers';

const LONG = '<p>' + 'Young voters worry about mass shootings and that fear shapes their views on gun control. '.repeat(25) + '</p><p>Second paragraph &amp; more.</p>';
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>tag:theconversation.com,2011:article/1</id><title>Young voters fear mass shootings</title>
<link rel="alternate" type="text/html" href="https://theconversation.com/young-voters-1"/><published>2026-10-18T10:00:00Z</published>
<summary>Short summary.</summary><author><name>Jane Doe</name></author><content type="html">${LONG.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</content></entry>
</feed>`;
const RSS = `<rss><channel><item><title>Hypemen redefining Afrobeats</title><link>https://www.theguardian.com/world/x</link>
<guid>https://www.theguardian.com/world/x</guid><pubDate>Sat, 18 Oct 2026 08:00:00 GMT</pubDate>
<description><![CDATA[<p>Style of emceeing has flourished.</p>]]></description><dc:creator>Ope Adetayo</dc:creator></item></channel></rss>`;

let cookie = '';
beforeEach(async () => { cookie = await login(); await env.DB.prepare('DELETE FROM articles').run(); await env.DB.prepare('DELETE FROM prepare_queue').run(); });

describe('flux d’articles', () => {
  it.each([
    ['maxifoot-general', 'football-general.xml'],
    ['maxifoot-top-articles', 'football-top-articles.xml'],
  ])('collecte le flux officiel HTTP %s et expose la source française', async (sourceId, filename) => {
    await env.DB.prepare("UPDATE article_sources SET next_check_at='2099-01-01T00:00:00.000Z'").run();
    await env.DB.prepare("UPDATE article_sources SET next_check_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(sourceId).run();
    const xml = `<rss><channel><item><title>Football : l’actualité &amp; les transferts</title>
      <link>https://www.maxifoot.fr/football/actualite-foot-1.htm</link>
      <guid isPermaLink="true">https://www.maxifoot.fr/football/actualite-foot-1.htm</guid>
      <description>Les dernières nouvelles du football français.</description>
      <pubDate>Tue, 20 Oct 2026 10:00:00 +0200</pubDate></item></channel></rss>`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
    expect(await collectArticles(env, Date.parse('2026-10-20T09:00:00Z'), fetcher))
      .toMatchObject({ status: 'ok', sourceId, items: 1 });
    expect(fetcher.mock.calls[0]![0]).toBe(`http://rss.maxifoot.com/${filename}`);
    const list = await (await call(`/api/articles?source=${sourceId}`, { cookie }))
      .json<{ articles: unknown[]; sources: unknown[] }>();
    expect(list.sources).toContainEqual(expect.objectContaining({ id: sourceId, publisher: 'Maxifoot', language: 'fr' }));
    expect(list.articles).toEqual([expect.objectContaining({ title: 'Football : l’actualité & les transferts', publisher: 'Maxifoot', contentStatus: 'none' })]);
  });

  it('refuse HTTP pour les autres hôtes de flux', async () => {
    await env.DB.prepare("UPDATE article_sources SET next_check_at='2099-01-01T00:00:00.000Z'").run();
    await env.DB.prepare(`INSERT INTO article_sources (id,title,publisher,feed_url,language,next_check_at,created_at)
      VALUES ('unsafe-http','HTTP','Test','http://rss.maxifoot.com.evil.example/flux.xml','fr','2000-01-01','2026-10-20')`).run();
    const fetcher = vi.fn<typeof fetch>();
    expect(await collectArticles(env, Date.parse('2026-10-20T09:00:00Z'), fetcher))
      .toMatchObject({ status: 'error', sourceId: 'unsafe-http' });
    expect(fetcher).not.toHaveBeenCalled();
    await env.DB.prepare("DELETE FROM article_sources WHERE id='unsafe-http'").run();
  });

  it('lit Atom avec texte complet et RSS avec résumé seulement', () => {
    const [atom] = parseArticleFeed(ATOM);
    expect(atom).toMatchObject({ url: 'https://theconversation.com/young-voters-1', title: 'Young voters fear mass shootings', author: 'Jane Doe', publishedAt: '2026-10-18T10:00:00.000Z' });
    expect(atom!.content).toContain('Second paragraph & more.');
    const [rss] = parseArticleFeed(RSS);
    expect(rss).toMatchObject({ title: 'Hypemen redefining Afrobeats', summary: 'Style of emceeing has flourished.', author: 'Ope Adetayo', content: null });
    expect(htmlToText('<p>Un</p><script>alert(1)</script><p>Deux</p>')).toBe('Un\n\nDeux');
  });

  it('collecte une source, liste les articles, demande le texte à l’Atelier puis crée la note et la préparation', async () => {
    await env.DB.prepare("UPDATE article_sources SET next_check_at='2099-01-01T00:00:00.000Z'").run();
    await env.DB.prepare("UPDATE article_sources SET next_check_at='2000-01-01T00:00:00.000Z' WHERE id='guardian-world'").run();
    const fetcher = (async () => new Response(RSS, { headers: { 'Content-Type': 'application/rss+xml' } })) as unknown as typeof fetch;
    expect(await collectArticles(env, Date.parse('2026-10-18T09:00:00Z'), fetcher)).toMatchObject({ status: 'ok', sourceId: 'guardian-world', items: 1 });
    const list = await (await call('/api/articles', { cookie })).json<{ articles: { id: string; contentStatus: string; publisher: string }[]; sources: unknown[] }>();
    expect(list.sources.length).toBe(6);
    const a = list.articles[0]!;
    expect(a).toMatchObject({ contentStatus: 'none', publisher: 'The Guardian' });
    expect((await call(`/api/articles/${a.id}/fetch`, { method: 'POST', cookie, body: {} })).status).toBe(202);
    const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
    const pending = await (await call('/atelier/article-texts', { headers })).json<{ items: { id: string }[] }>();
    expect(pending.items.map((i) => i.id)).toContain(a.id);
    const text = 'Hypemen neither sing nor rap entirely, but perform high-octane ad-libbed vocals over the music.';
    expect((await call(`/atelier/article-texts/${a.id}`, { method: 'POST', headers, body: { status: 'complete', text } })).status).toBe(200);
    const detail = await (await call(`/api/articles/${a.id}`, { cookie })).json<{ article: { contentText: string; contentStatus: string } }>();
    expect(detail.article).toMatchObject({ contentText: text, contentStatus: 'complete' });

    const note = await call(`/api/articles/${a.id}/note`, { method: 'POST', cookie, body: { prepare: { coverage: 'essentials', targetMinutes: 4 } } });
    expect(note.status, await note.clone().text()).toBe(201);
    const { noteId, item } = await note.json<{ noteId: string; item: { kind: string; ref: string } }>();
    expect(item).toMatchObject({ kind: 'reflection', ref: noteId });
    const r = await (await call(`/api/reflections/${noteId}`, { cookie })).json<{ reflection: { origin: string; sourceName: string; body: string } }>();
    expect(r.reflection).toMatchObject({ origin: 'article', sourceName: 'The Guardian', body: text });
    // Une seconde demande réutilise la même note.
    expect((await (await call(`/api/articles/${a.id}/note`, { method: 'POST', cookie, body: {} })).json<{ noteId: string }>()).noteId).toBe(noteId);
  });
});
