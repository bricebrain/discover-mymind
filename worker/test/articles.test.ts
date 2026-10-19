import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(list.sources.length).toBe(4);
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
