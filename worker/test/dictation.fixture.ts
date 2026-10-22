import { expect } from 'vitest';
import type { Manifest } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call } from './helpers';

export async function publishDictation(guided = false) {
    const contentId = 'dictation-' + crypto.randomUUID().slice(0, 8);
    const raw = JSON.stringify({ schemaVersion: 1, variantKey: 'en-source', segments: [
      { id: 's0001', text: 'The bank is expected to hold rates steady.', startMs: guided ? 0 : null, endMs: guided ? 4000 : null }],
      ...(guided ? { guide: { level: 'B1', voice: 'original', passage: { fromSegment: 's0001', toSegment: 's0001' },
        expressions: [{ segmentId: 's0001', text: 'bank', note: 'Banque' }], listening: [], dictation: [{ id: 'd001', segmentId: 's0001', text: 'The bank is expected', startMs: 0, endMs: 2000 }] } } : {}) });
    const files: Manifest['files'] = { 'segments/en-source.json': { sha256: await sha256Hex(raw), size: raw.length, contentType: 'application/json' } };
    const manifest: Manifest = { schemaVersion: 1, content: { id: contentId, title: 'Rates', originalLanguage: 'en', sourceType: 'youtube', rights: 'personal_use' },
      variants: [{ key: 'en-source', kind: 'source', language: 'en', segmentsFile: 'segments/en-source.json',
        ...(guided ? { audio: { source: 'r2' as const, file: 'audio/source.mp3', origin: 'original' as const, durationMs: 4000, timingSource: 'rss_vtt' as const } } : {}) }], files };
    if (guided) { const audio = 'ID3-test'; files['audio/source.mp3'] = { sha256: await sha256Hex(audio), size: audio.length, contentType: 'audio/mpeg' }; }
    const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
    const state = await (await call('/atelier/publications', { method: 'POST', headers, body: { manifest } })).json<{ publicationId: string; missing: string[] }>();
    for (const path of state.missing) await call(`/atelier/publications/${state.publicationId}/files/${path}`, { method: 'PUT', body: path.startsWith('audio/') ? 'ID3-test' : raw,
      headers: { ...headers, 'x-content-sha256': files[path]!.sha256, 'Content-Type': files[path]!.contentType } });
    expect((await call(`/atelier/publications/${state.publicationId}/commit`, { method: 'POST', headers })).status).toBe(200);
    return { contentId, publicationId: state.publicationId, url: `/api/contents/${contentId}/variants/en-source/dictation` };
  }

