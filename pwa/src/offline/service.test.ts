import { describe, expect, it, vi } from 'vitest';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { sha256Hex, shouldSendProgress } from './logic';
import { memoryStore } from './memoryStore.test-helper';
import { createOfflineService, type OfflineDeps } from './service';

const AUDIO = new Uint8Array(4096).map((_, i) => i % 251);
const segments = (key: string) => ({ schemaVersion: 1, variantKey: key, segments: [{ id: 's001', text: 'Hello.', fr: 'Bonjour.', startMs: 0, endMs: 1000 }] });

async function fixture(options: { sha?: string; source?: 'r2' | 'publisher_stream'; publication?: string } = {}) {
  const sha = options.sha ?? await sha256Hex(new Blob([AUDIO]));
  const variant: ContentVariant = {
    key: 'en-b1', kind: 'adaptation', language: 'en', cefrLevel: 'B1', coverage: 'full', style: 'narration', timingStatus: 'exact',
    segmentsUrl: '/api/contents/c-1/variants/en-b1/segments?publication=p1',
    audio: { source: options.source ?? 'r2', url: '/api/contents/c-1/variants/en-b1/audio?publication=p1', sha256: sha, durationMs: 1000, timingSource: 'kokoro' },
  };
  const detail: ContentDetail = { content: { id: 'c-1', title: 'Un contenu' }, publicationId: options.publication ?? 'p1', variants: [variant] };
  return { detail, variant };
}

function setup(over: Partial<OfflineDeps> & { audioBody?: () => Response } = {}) {
  const mem = memoryStore();
  let n = 0;
  const revoked: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/segments')) return Response.json(segments('en-b1'));
    if (url.includes('/audio')) {
      if (over.audioBody) return over.audioBody();
      const signal = init?.signal;
      // Flux en deux morceaux pour observer la progression (et permettre l'annulation entre les deux).
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(AUDIO.slice(0, 2048));
          await new Promise((r) => setTimeout(r, 5));
          if (signal?.aborted) { controller.error(new DOMException('Aborted', 'AbortError')); return; }
          controller.enqueue(AUDIO.slice(2048));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Length': String(AUDIO.byteLength), 'Content-Type': 'audio/mpeg' } });
    }
    return new Response(null, { status: 404 });
  });
  const service = createOfflineService({
    store: mem.store, fetch: fetchMock as unknown as typeof fetch,
    createUrl: () => `blob:test/${++n}`, revokeUrl: (u) => revoked.push(u), ...over,
  });
  return { service, mem, fetchMock, revoked };
}

describe('téléchargement d’une version', () => {
  it('valide l’audio et la transcription avant de marquer la version disponible hors ligne', async () => {
    const { detail, variant } = await fixture();
    const { service, mem } = setup();
    const seen: number[] = [];
    service.subscribe(() => { const a = service.getSnapshot().active['c-1:en-b1']; if (a) seen.push(a.received); });
    await service.start(detail, variant);
    const record = mem.downloads.get('c-1:en-b1')!;
    expect(record.status).toBe('complete');
    expect(record.audioBytes).toBe(AUDIO.byteLength);
    expect(mem.audio.get('c-1:en-b1')?.size).toBe(AUDIO.byteLength);
    expect(seen).toContain(2048);
    expect(service.audioUrl(variant.audio!.sha256!)).toMatch(/^blob:test\//);
    const offline = await service.detail('c-1');
    expect(offline?.variants[0]?.audio?.url).toBe(service.audioUrl(variant.audio!.sha256!));
    expect((await service.segments('p1', 'en-b1'))?.segments[0]?.text).toBe('Hello.');
    expect(service.getSnapshot().active).toEqual({});
  });

  it('refuse un audio altéré : rien n’est présenté comme téléchargé', async () => {
    const { detail, variant } = await fixture({ sha: 'f'.repeat(64) });
    const { service, mem } = setup();
    await expect(service.start(detail, variant)).rejects.toMatchObject({ code: 'integrity' });
    expect(mem.downloads.get('c-1:en-b1')?.status).toBe('failed');
    expect(mem.audio.size).toBe(0);
    expect(service.audioUrl('f'.repeat(64))).toBeUndefined();
    expect(await service.detail('c-1')).toBeNull();
  });

  it('un fichier tronqué échoue au lieu d’être gardé', async () => {
    const { detail, variant } = await fixture();
    const { service, mem } = setup({ audioBody: () => new Response(AUDIO.slice(0, 100), { headers: { 'Content-Length': String(AUDIO.byteLength) } }) });
    await expect(service.start(detail, variant)).rejects.toMatchObject({ code: 'integrity' });
    expect(mem.downloads.get('c-1:en-b1')?.status).toBe('failed');
  });

  it('l’annulation ne laisse aucune trace', async () => {
    const { detail, variant } = await fixture();
    const { service, mem } = setup();
    const running = service.start(detail, variant);
    await new Promise((r) => setTimeout(r, 1));
    service.cancel('c-1:en-b1');
    await running;
    expect(mem.downloads.size).toBe(0);
    expect(mem.audio.size).toBe(0);
  });

  it('espace insuffisant : refus avant le téléchargement, puis quota dépassé à l’écriture', async () => {
    const { detail, variant } = await fixture();
    const tight = setup({ estimate: async () => ({ usage: 1000, quota: 2000 }) });
    await expect(tight.service.start(detail, variant)).rejects.toMatchObject({ code: 'storage' });
    const quota = setup();
    quota.mem.state.failNextComplete = new DOMException('plein', 'QuotaExceededError');
    await expect(quota.service.start(detail, variant)).rejects.toMatchObject({ code: 'storage' });
    expect(quota.mem.downloads.get('c-1:en-b1')?.status).toBe('failed');
  });

  it('exclut les flux officiels de l’éditeur', async () => {
    const { detail, variant } = await fixture({ source: 'publisher_stream' });
    const { service, fetchMock, mem } = setup();
    await expect(service.start(detail, variant)).rejects.toMatchObject({ code: 'external' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mem.downloads.size).toBe(0);
  });

  it('un autre onglet qui télécharge déjà la même version n’est pas perturbé', async () => {
    const { detail, variant } = await fixture();
    const { service, mem } = setup({ withLock: async (_name, run) => run(false), heldLocks: async () => new Set(['discover-download:c-1:en-b1']) });
    await mem.store.putDownload({ key: 'c-1:en-b1', status: 'downloading' } as never);
    await expect(service.start(detail, variant)).rejects.toMatchObject({ code: 'busy' });
    expect(mem.downloads.get('c-1:en-b1')?.status).toBe('downloading');
  });

  it('une nouvelle publication ne remplace l’ancienne qu’une fois validée', async () => {
    const first = await fixture();
    const { service, mem } = setup();
    await service.start(first.detail, first.variant);
    const next = await fixture({ sha: 'e'.repeat(64), publication: 'p2' });
    await expect(service.start(next.detail, next.variant)).rejects.toBeTruthy();
    const kept = mem.downloads.get('c-1:en-b1')!;
    expect(kept.status).toBe('complete');
    expect(kept.publicationId).toBe('p1');
    expect(service.audioUrl(first.variant.audio!.sha256!)).toBeTruthy();
  });
});

describe('démarrage, suppression et purge', () => {
  it('au démarrage : téléchargement interrompu et fichier évincé sont signalés', async () => {
    const { detail, variant } = await fixture();
    const a = setup();
    await a.service.start(detail, variant);
    const complete = a.mem.downloads.get('c-1:en-b1')!;
    const mem = memoryStore();
    await mem.store.putDownload({ ...complete, key: 'c-2:en-b1', contentId: 'c-2', status: 'downloading' });
    await mem.store.putDownload({ ...complete, key: 'c-3:en-b1', contentId: 'c-3', status: 'downloading' });
    await mem.store.putDownload(complete); // fichier audio absent : évincé
    const b = createOfflineService({ store: mem.store, fetch: vi.fn() as never, createUrl: () => 'blob:x', revokeUrl: () => {},
      heldLocks: async () => new Set(['discover-download:c-3:en-b1']) });
    await b.init();
    expect(mem.downloads.get('c-2:en-b1')?.status).toBe('interrupted');
    expect(mem.downloads.get('c-3:en-b1')?.status).toBe('downloading');
    expect(mem.downloads.get('c-1:en-b1')?.status).toBe('broken');
    expect(b.hasDownloads()).toBe(false);
  });

  it('supprimer libère le fichier et l’URL ; la purge efface aussi la progression locale', async () => {
    const { detail, variant } = await fixture();
    const { service, mem, revoked } = setup();
    await service.start(detail, variant);
    const url = service.audioUrl(variant.audio!.sha256!)!;
    await service.remove('c-1:en-b1');
    expect(revoked).toContain(url);
    expect(mem.downloads.size + mem.audio.size).toBe(0);
    expect((await service.usage()).downloads).toBe(0);
    await service.start(detail, variant);
    await service.recordProgress({ targetType: 'variant', targetId: 'c-1:en-b1', audioRef: 'x', positionMs: 1, durationMs: null, completed: false }, true);
    await service.purge();
    expect(mem.downloads.size + mem.audio.size + mem.progress.size).toBe(0);
    expect(service.hasDownloads()).toBe(false);
  });
});

describe('progression hors ligne', () => {
  const body = { targetType: 'variant' as const, targetId: 'c-1:en-b1', audioRef: 'sha', positionMs: 42_000, durationMs: 60_000, completed: false };

  it('garde la position locale et ne la rend que pour le même audio', async () => {
    const { service } = setup();
    await service.recordProgress(body, true);
    expect((await service.localProgress(body))?.body.positionMs).toBe(42_000);
    expect(await service.localProgress({ ...body, audioRef: 'autre' })).toBeNull();
  });

  it('au retour du réseau, une écoute plus récente ailleurs n’est pas écrasée', async () => {
    let clock = Date.parse('2026-10-19T10:00:00Z');
    const { service, mem } = setup({ now: () => new Date(clock) });
    await service.recordProgress(body, true);
    const send = vi.fn(async () => {});
    await service.flushProgress(send, async () => ({ updatedAt: '2026-10-19T11:00:00.000Z', audioRef: 'sha' }));
    expect(send).not.toHaveBeenCalled();
    expect(mem.progress.get('variant:c-1:en-b1')?.pending).toBe(false);
    clock = Date.parse('2026-10-19T12:00:00Z');
    await service.recordProgress({ ...body, positionMs: 50_000 }, true);
    await service.flushProgress(send, async () => ({ updatedAt: '2026-10-19T11:00:00.000Z' }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 50_000 }));
  });

  it('la position du serveur copiée au téléchargement n’écrase pas une écoute locale', async () => {
    const { service, mem } = setup();
    await service.seedProgress({ ...body, positionMs: 10_000 }, '2026-10-19T09:00:00.000Z');
    expect(mem.progress.get('variant:c-1:en-b1')).toMatchObject({ pending: false, body: { positionMs: 10_000 } });
    await service.recordProgress(body, true);
    await service.seedProgress({ ...body, positionMs: 5_000 }, '2026-10-19T09:30:00.000Z');
    expect(mem.progress.get('variant:c-1:en-b1')?.body.positionMs).toBe(42_000);
  });

  it('toujours hors ligne : la position reste en attente', async () => {
    const { service, mem } = setup();
    await service.recordProgress(body, true);
    await service.flushProgress(async () => {}, async () => { throw new Error('offline'); });
    expect(mem.progress.get('variant:c-1:en-b1')?.pending).toBe(true);
  });

  it('règle de synchronisation', () => {
    const local = { key: 'k', body, recordedAt: '2026-10-19T10:00:00.000Z', pending: true };
    expect(shouldSendProgress(local, null)).toBe(true);
    expect(shouldSendProgress(local, { updatedAt: '2026-10-19T09:59:59.000Z' })).toBe(true);
    expect(shouldSendProgress(local, { updatedAt: '2026-10-19T10:00:01.000Z' })).toBe(false);
  });
});
