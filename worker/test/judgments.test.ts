import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import base from '../../contracts/fixtures/valid-affaire.json';
import type { Manifest } from '../src/publications/types';
import { judgmentUrl } from '../src/judgments/source';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

it('n’accepte qu’une URL de décision précise', () => {
  expect(judgmentUrl('https://courtlistener.com/opinion/42/example/')).toBe('https://www.courtlistener.com/opinion/42/example/');
  for (const url of ['https://example.com/opinion/42/', 'https://www.courtlistener.com/?q=case',
    'http://caselaw.nationalarchives.gov.uk/uksc/2024/1', 'https://caselaw.nationalarchives.gov.uk/search',
    'https://caselaw.nationalarchives.gov.uk/uksc/2024/1#x']) expect(() => judgmentUrl(url)).toThrow();
});

it('prépare une affaire sous bail, puis ne révèle le verdict qu’après la réponse', async () => {
  const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
  const cookie = await login();
  const options = { coverage: 'guided', level: 'B1', style: 'narration', targetMinutes: null, faithful: false, keepOriginalCopy: false };
  const queued = await call('/atelier/sources', { method: 'POST', headers, body: { kind: 'affaire', url: base.content.sourceUrl, options } });
  expect(queued.status, await queued.clone().text()).toBe(201);
  const { item } = await queued.json<{ item: { id: string } }>();
  const leased = await (await call('/atelier/queue/lease', { method: 'POST', headers, body: { owner: 'test-affaire', itemId: item.id } }))
    .json<{ item: { leaseToken: string; source: { kind: string; url: string } } }>();
  expect(leased.item.source).toMatchObject({ kind: 'affaire', url: base.content.sourceUrl });
  const manifest = structuredClone(base) as Manifest;
  manifest.content.id = 'affaire-' + crypto.randomUUID().slice(0, 8);
  const narrated = manifest.variants[1]!;
  narrated.audio = { source: 'r2', file: 'audio/story.mp3', origin: 'kokoro', durationMs: 4000, timingSource: 'kokoro' };
  const source = { id: 's001', text: 'The buyer disputes the contract.', startMs: null, endMs: null };
  const doc = { schemaVersion: 1, variantKey: narrated.key, segments: [{ ...source, fr: 'L’acheteur conteste le contrat.', speaker: 'Guest', startMs: 0, endMs: 4000 }],
    guide: { level: 'B1', voice: 'synthetic', passage: { fromSegment: 's001', toSegment: 's001' },
      expressions: [{ segmentId: 's001', text: 'buyer', note: 'Acheteur' }], listening: [],
      dictation: [{ id: 'd001', segmentId: 's001', text: source.text, startMs: 0, endMs: 4000 }] } };
  const payloads: Record<string,string> = { 'segments/en-source.json': JSON.stringify({ schemaVersion: 1, variantKey: 'en-source', segments: [source] }),
    'segments/adapted.json': JSON.stringify(doc), 'audio/story.mp3': 'ID3-audio-test' };
  for (const [path, raw] of Object.entries(payloads)) manifest.files[path] = { sha256: await sha256Hex(raw), size: new TextEncoder().encode(raw).length, contentType: path.startsWith('audio') ? 'audio/mpeg' : 'application/json' };
  const declaration = await call('/atelier/publications', { method: 'POST', headers,
    body: { manifest, queueItemId: item.id, leaseToken: leased.item.leaseToken } });
  expect(declaration.status, await declaration.clone().text()).toBe(200);
  const state = await declaration.json<{ publicationId: string; missing: string[] }>();
  for (const path of state.missing) {
    const f = manifest.files[path]!;
    expect((await call(`/atelier/publications/${state.publicationId}/files/${path}`, { method: 'PUT', body: payloads[path],
      headers: { ...headers, 'X-Discover-Lease-Token': leased.item.leaseToken, 'Content-Type': f.contentType, 'x-content-sha256': f.sha256 } })).status).toBe(200);
  }
  const commit = await call(`/atelier/publications/${state.publicationId}/commit`, { method: 'POST', headers: { ...headers, 'X-Discover-Lease-Token': leased.item.leaseToken } });
  expect(commit.status, await commit.clone().text()).toBe(200);
  const quiz = `/api/contents/${manifest.content.id}/variants/${narrated.key}/quiz`;
  const initial = await (await call(quiz, { cookie })).text();
  expect(initial).toContain('judgment');
  expect(initial).not.toContain('correctChoice');
  expect(initial).not.toContain('La cour suspend');
  const detail = await (await call(`/api/contents/${manifest.content.id}`, { cookie })).text();
  expect(detail).toContain('Open Justice Licence');
  expect(detail).not.toContain('verdict');
  const answer = await call(quiz + '/answers', { method: 'POST', cookie, body: { publicationId: state.publicationId, questionIndex: 0, choice: 3 } });
  expect(answer.status, await answer.clone().text()).toBe(200);
  expect(await answer.json()).toMatchObject({ answer: { correct: true, correctChoice: 3, explanation: 'La cour suspend la procédure.' } });
  expect(await env.DB.prepare('SELECT status FROM prepare_queue WHERE id=?').bind(item.id).first()).toEqual({ status: 'done' });
});
