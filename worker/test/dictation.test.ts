import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { align, mistakes, score, words } from '../src/dictation/align';
import { fallbackCategory } from '../src/dictation/routes';
import type { Manifest } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

const SENTENCE = 'Uh, the Bank of England is expected to hold rates steady at 65 percent, sixty-five.';

describe('alignement d’une dictée', () => {
  it('ignore hésitations, casse et ponctuation, et lit les nombres en chiffres ou en lettres', () => {
    expect(words(SENTENCE)).toEqual(['the', 'bank', 'of', 'england', 'is', 'expected', 'to', 'hold', 'rates', 'steady', 'at', '65', 'percent', '65']);
    expect(words('Sixty five % — It’s FINE')).toEqual(['65', 'percent', "it's", 'fine']);
  });

  it('compte les mots reconnus et regroupe les erreurs consécutives', () => {
    const tokens = align(words('the bank is expected to hold rates steady'), words('the bank is expect it hold rates'));
    expect(score(tokens)).toEqual({ expectedWords: 8, correctWords: 5 });
    expect(mistakes(tokens)).toEqual([{ expected: 'expected to', heard: 'expect it' }, { expected: 'steady', heard: '' }]);
  });

  it('déduit une catégorie sans IA', () => {
    expect(fallbackCategory({ expected: 'steady', heard: '' })).toBe('missed');
    expect(fallbackCategory({ expected: '65', heard: '56' })).toBe('number');
    expect(fallbackCategory({ expected: 'expected to', heard: 'expectedto' })).toBe('linking');
    expect(fallbackCategory({ expected: 'steady', heard: 'steddy' })).toBe('spelling');
  });
});

describe('route de dictée', () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function publish() {
    const contentId = 'dictation-' + crypto.randomUUID().slice(0, 8);
    const raw = JSON.stringify({ schemaVersion: 1, variantKey: 'en-source', segments: [
      { id: 's0001', text: 'The bank is expected to hold rates steady.', startMs: null, endMs: null }] });
    const files: Manifest['files'] = { 'segments/en-source.json': { sha256: await sha256Hex(raw), size: raw.length, contentType: 'application/json' } };
    const manifest: Manifest = { schemaVersion: 1, content: { id: contentId, title: 'Rates', originalLanguage: 'en', sourceType: 'youtube', rights: 'personal_use' },
      variants: [{ key: 'en-source', kind: 'source', language: 'en', segmentsFile: 'segments/en-source.json' }], files };
    const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
    const state = await (await call('/atelier/publications', { method: 'POST', headers, body: { manifest } })).json<{ publicationId: string; missing: string[] }>();
    for (const path of state.missing) await call(`/atelier/publications/${state.publicationId}/files/${path}`, { method: 'PUT', body: raw,
      headers: { ...headers, 'x-content-sha256': files[path]!.sha256, 'Content-Type': 'application/json' } });
    expect((await call(`/atelier/publications/${state.publicationId}/commit`, { method: 'POST', headers })).status).toBe(200);
    return { contentId, publicationId: state.publicationId, url: `/api/contents/${contentId}/variants/en-source/dictation` };
  }

  it('corrige mot à mot, explique chaque erreur avec l’IA et alimente la progression', async () => {
    const p = await publish();
    const http = vi.fn()
      // Réponses créées pendant la requête du Worker (un corps créé ailleurs n'y est pas lisible).
      .mockImplementationOnce(async () => Response.json({ totalTokens: 120 }))
      .mockImplementationOnce(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
        errors: [{ index: 0, category: 'reduced_form', explanation: '« to » est réduit : on entend « expectid ».' },
                 { index: 1, category: 'unknown_word', explanation: '« steady » : stable.' }],
        tip: 'Guette les petits mots réduits après un verbe.' }) }] } }] }));
    vi.stubGlobal('fetch', http);
    expect((await call(p.url, { method: 'POST', body: { publicationId: p.publicationId, segmentId: 's0001', typed: 'x' } })).status).toBe(401);
    const r = await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, segmentId: 's0001',
      typed: 'The bank is expected it hold rates' } });
    expect(r.status, await r.clone().text()).toBe(200);
    const result = await r.json<{ accuracy: number; errors: { category: string; explanation: string }[]; tip: string }>();
    expect(result.accuracy).toBeCloseTo(6 / 8);
    expect(result.errors.map((e) => e.category)).toEqual(['reduced_form', 'unknown_word']);
    expect(result.tip).toContain('petits mots');
    const progress = await (await call('/api/dictation/progress', { cookie })).json<{ weeks: { sentences: number; understoodShare: number }[]; categories: { category: string; count: number }[] }>();
    expect(progress.weeks.at(-1)).toMatchObject({ sentences: 1, understoodShare: 0 });
    expect(progress.categories).toEqual(expect.arrayContaining([{ category: 'reduced_form', count: 1 }]));
  });

  it('reste utilisable sans IA : correction et catégories déduites', async () => {
    const p = await publish();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Gemini indisponible'); }));
    const result = await (await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, segmentId: 's0001',
      typed: 'The bank is expected to hold rates steady.' } })).json<{ accuracy: number; errors: unknown[]; tip: null }>();
    expect(result).toMatchObject({ accuracy: 1, errors: [], tip: null });
    const partial = await (await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, segmentId: 's0001',
      typed: 'The bank is expected to hold' } })).json<{ errors: { category: string; explanation: null }[] }>();
    expect(partial.errors).toEqual([{ expected: 'rates steady', heard: '', category: 'missed', explanation: null }]);
  });

  it('refuse une phrase inconnue ou un texte trop long', async () => {
    const p = await publish();
    expect((await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, segmentId: 'nope', typed: 'x' } })).status).toBe(404);
    expect((await call(p.url, { method: 'POST', cookie, body: { publicationId: p.publicationId, segmentId: 's0001', typed: 'x'.repeat(1001) } })).status).toBe(400);
  });
});
