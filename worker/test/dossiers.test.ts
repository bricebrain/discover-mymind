import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/publications/validation';
import type { Manifest } from '../src/publications/types';
import { sha256Hex } from '../src/security/crypto';
import { ATELIER_TOKEN, call, login } from './helpers';

const headers = { Authorization: `Bearer ${ATELIER_TOKEN}` };
const ep = 'e'.repeat(20);
let cookie = '', note = '';
const bytes = (t: string) => new TextEncoder().encode(t).length;
const options = { coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 10 };

beforeEach(async () => {
  cookie = await login();
  await env.DB.prepare('DELETE FROM prepare_queue').run();
  await env.DB.prepare("INSERT OR IGNORE INTO episodes (id,show_id,guid,title,audio_url,created_at) SELECT ?,id,'dossier-ep','Épisode sur la dette','https://example.com/dette.mp3','2026-10-19' FROM shows LIMIT 1").bind(ep).run();
  note = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO reflections (id,title,body_md,created_at,updated_at) VALUES (?,'Ma note','Une réflexion assez longue sur la dette publique.','2026-10-19','2026-10-19')").bind(note).run();
});

async function createDossier(sources = [{ type: 'episode', id: ep }, { type: 'reflection', id: note }]) {
  return call('/api/dossiers', { method: 'POST', cookie, body: { title: 'Dette publique', sources } });
}

describe('dossiers', () => {
  it('crée, liste et refuse les sources invalides ou en double', async () => {
    const r = await createDossier();
    expect(r.status, await r.clone().text()).toBe(201);
    const { dossier } = await r.json<{ dossier: { id: string; version: number; sources: unknown[] } }>();
    expect(dossier.sources).toHaveLength(2);
    expect((await (await call('/api/dossiers', { cookie })).json<{ dossiers: { id: string }[] }>()).dossiers.some((d) => d.id === dossier.id)).toBe(true);
    expect((await createDossier([{ type: 'episode', id: ep }])).status).toBe(422);
    expect((await createDossier([{ type: 'episode', id: ep }, { type: 'episode', id: ep }])).status).toBe(422);
    expect((await createDossier([{ type: 'episode', id: ep }, { type: 'reflection', id: crypto.randomUUID() }])).status).toBe(422);
    const cr = await call('/api/dossier-sources?q=dette', { cookie });
    expect(cr.status, await cr.clone().text()).toBe(200);
    const candidates = await cr.json<{ sources: { type: string; id: string }[] }>();
    expect(candidates.sources.some((s) => s.type === 'episode' && s.id === ep)).toBe(true);
  });

  it('modification concurrente : la version ancienne est refusée', async () => {
    const { dossier } = await (await createDossier()).json<{ dossier: { id: string; version: number } }>();
    const patch = (version: number) => call(`/api/dossiers/${dossier.id}`, { method: 'PATCH', cookie, body: { title: 'Autre titre', version, sources: [{ type: 'reflection', id: note }, { type: 'episode', id: ep }] } });
    expect((await patch(dossier.version)).status).toBe(200);
    expect((await patch(dossier.version)).status).toBe(409);
  });

  it('préparer deux fois les mêmes options retrouve la même demande ; intégral refusé', async () => {
    const { dossier } = await (await createDossier()).json<{ dossier: { id: string } }>();
    expect((await call(`/api/dossiers/${dossier.id}/prepare`, { method: 'POST', cookie, body: { ...options, coverage: 'full', targetMinutes: null } })).status).toBe(422);
    const a = await (await call(`/api/dossiers/${dossier.id}/prepare`, { method: 'POST', cookie, body: options })).json<{ item: { id: string; kind: string } }>();
    const b = await (await call(`/api/dossiers/${dossier.id}/prepare`, { method: 'POST', cookie, body: options })).json<{ item: { id: string } }>();
    expect(a.item.kind).toBe('dossier');
    expect(b.item.id).toBe(a.item.id);
    const detail = await (await call(`/api/dossiers/${dossier.id}`, { cookie })).json<{ runs: { status: string }[] }>();
    expect(detail.runs).toHaveLength(1);
  });

  it('publie la synthèse avec la provenance des passages, et refuse des sources différentes de celles capturées', async () => {
    const { dossier } = await (await createDossier()).json<{ dossier: { id: string } }>();
    await call(`/api/dossiers/${dossier.id}/prepare`, { method: 'POST', cookie, body: options });
    const lease = await (await call('/atelier/queue/lease', { method: 'POST', headers, body: { owner: 'mac' } })).json<{ item: { id: string; ref: string; leaseToken: string; source: { kind: string; sources: { id: string; type: string; ref: string; title: string; capturedAt: string }[] } } }>();
    const item = lease.item;
    expect(item.source.kind).toBe('dossier');
    expect(item.source.sources.map((s) => s.id)).toEqual(['d1', 'd2']);

    const sourceRaw = canonicalJson({ schemaVersion: 1, variantKey: 'fr-source', segments: [
      { id: 'd1-s0001', text: 'La dette atteint 110 %.', startMs: null, endMs: null, provenance: { sourceId: 'd1', segmentId: 's0001', startMs: 61_000, endMs: 64_000 } },
      { id: 'd2-s0001', text: 'Je pense qu’elle baissera.', startMs: null, endMs: null, provenance: { sourceId: 'd2', segmentId: 's0001', startMs: null, endMs: null } },
    ] });
    const adaptedRaw = canonicalJson({ schemaVersion: 1, variantKey: 'en-condensed-b1-10m', segments: [
      { id: 'p0001', text: 'Debt is 110 percent, says the episode, while the note expects it to fall.', fr: 'La dette atteint 110 %, selon l’épisode, tandis que la note prévoit une baisse.', speaker: 'Narrator', sourceSegments: ['d1-s0001', 'd2-s0001'], startMs: 0, endMs: 2000 },
    ] });
    const audio = 'kokoro-dossier-audio';
    const sources = item.source.sources.map((s) => ({ id: s.id, type: s.type, ref: s.ref, title: s.title, capturedAt: s.capturedAt, sha256: 'c'.repeat(64) }));
    const m: Manifest = {
      schemaVersion: 1,
      content: { id: `dossier-${item.ref}`, title: 'Dette publique', originalLanguage: 'fr', sourceType: 'dossier', sourceRef: `dossier:${item.ref}`, rights: 'personal_use', sources: sources as Manifest['content']['sources'] },
      variants: [
        { key: 'fr-source', kind: 'source', language: 'fr', segmentsFile: 'segments/fr-source.json' },
        { key: 'en-condensed-b1-10m', kind: 'adaptation', language: 'en', cefrLevel: 'B1', style: 'narration', coverage: 'condensed', derivedFrom: 'fr-source',
          condensation: { targetMinutes: 10, sourceMinutes: 12, excludeAds: true }, segmentsFile: 'segments/en-condensed-b1-10m.json', evaluation: { verdict: 'ok' },
          audio: { source: 'r2', file: 'audio/en-condensed-b1-10m.mp3', origin: 'kokoro', durationMs: 2000, timingSource: 'kokoro' } },
      ],
      files: {
        'segments/fr-source.json': { sha256: await sha256Hex(sourceRaw), size: bytes(sourceRaw), contentType: 'application/json' },
        'segments/en-condensed-b1-10m.json': { sha256: await sha256Hex(adaptedRaw), size: bytes(adaptedRaw), contentType: 'application/json' },
        'audio/en-condensed-b1-10m.mp3': { sha256: await sha256Hex(audio), size: bytes(audio), contentType: 'audio/mpeg' },
      },
      removeVariants: [],
    };
    const data: Record<string, string> = { 'segments/fr-source.json': sourceRaw, 'segments/en-condensed-b1-10m.json': adaptedRaw, 'audio/en-condensed-b1-10m.mp3': audio };
    const declare = (manifest: Manifest) => call('/atelier/publications', { method: 'POST', headers, body: { manifest, queueItemId: item.id, leaseToken: item.leaseToken } });
    const swapped = structuredClone(m);
    swapped.content.sources = [{ ...sources[0]!, ref: 'f'.repeat(20) } as never, sources[1] as never];
    const refused = await declare(swapped);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: { code: 'dossier_sources_mismatch' } });

    const declared = await declare(m);
    expect(declared.status, await declared.clone().text()).toBe(200);
    const s = await declared.json<{ publicationId: string; missing: string[] }>();
    for (const path of s.missing) {
      const f = m.files[path]!;
      const up = await call(`/atelier/publications/${s.publicationId}/files/${path}`, { method: 'PUT', body: data[path], headers: { ...headers, 'X-Discover-Lease-Token': item.leaseToken, 'Content-Type': f.contentType, 'Content-Length': String(f.size), 'x-content-sha256': f.sha256 } });
      expect(up.status, await up.text()).toBe(200);
    }
    const commit = await call(`/atelier/publications/${s.publicationId}/commit`, { method: 'POST', headers: { ...headers, 'X-Discover-Lease-Token': item.leaseToken } });
    expect(commit.status, await commit.clone().text()).toBe(200);
    const detail = await (await call(`/api/contents/dossier-${item.ref}`, { cookie })).json<{ content: { sources: { id: string }[] } }>();
    expect(detail.content.sources.map((x) => x.id)).toEqual(['d1', 'd2']);
    const library = await (await call('/api/library?type=dossier', { cookie })).json<{ contents: { id: string }[] }>();
    expect(library.contents.map((c) => c.id)).toContain(`dossier-${item.ref}`);
    const queued = await env.DB.prepare('SELECT status,content_id FROM prepare_queue WHERE id=?').bind(item.id).first<{ status: string; content_id: string }>();
    expect(queued).toMatchObject({ status: 'done', content_id: `dossier-${item.ref}` });
  });
});
