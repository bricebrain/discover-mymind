import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ATELIER_TOKEN, PASSPHRASE, call } from './helpers';
import { setupExport, cookie, audioSha, dossierId, EP, CONTENT_ID, CHANNEL, type ExportPayload } from './export.fixture';

beforeEach(setupExport);

const fetchExport = async (query = '?v=2') => (await call(`/api/export${query}`, { cookie })).json<ExportPayload>();

describe('export v2', () => {
  it('contient les notes (corbeille marquée, articles avec leur source), les émissions YouTube et la progression', async () => {
    const data = await fetchExport();
    expect(data.schemaVersion).toBe(2);
    expect(data.reflections).toHaveLength(4);
    const article = data.reflections.find((r) => r.origin === 'article');
    expect(article).toMatchObject({ sourceName: 'Le Monde', sourceUrl: 'https://www.lemonde.fr/economie/article.html' });
    expect(article!.links[0]).toMatchObject({ targetTitle: 'La dette américaine — Code source', quote: 'le dollar reste dominant' });
    expect(data.reflections.find((r) => r.deletedAt !== null)).toBeTruthy();
    const youtube = data.shows.find((s) => s.id === 'yt');
    expect(youtube).toMatchObject({ sourceType: 'youtube', channelId: CHANNEL, feedUrl: expect.stringContaining('youtube.com') });
    expect(data.savedEpisodes[0]).toMatchObject({ id: EP, title: 'La dette américaine', audioUrl: 'https://cdn.example.com/a.mp3' });
    expect(data.listeningProgress).toHaveLength(2);
    expect(data.listeningProgress.find((p) => p.targetType === 'episode')).toMatchObject({ targetId: EP, positionMs: 61_000, completed: false });
    expect(data.listeningProgress.find((p) => p.targetType === 'variant')).toMatchObject({ targetId: `${CONTENT_ID}:en-full-b1`, completed: true });
    expect(data.appSettings).toEqual({ autoPrepareEnabled: true });
  });

  it('contient les contenus préparés : variantes, segments traduits, audio avec empreinte et taille', async () => {
    const data = await fetchExport();
    const content = data.contents.find((c) => c.id === CONTENT_ID);
    expect(content).toMatchObject({ title: 'Ma note préparée', sourceType: 'reflection' });
    expect(content!.publication.revision).toBeTruthy();
    expect(content!.files).toHaveLength(3);
    const en = content!.variants.find((v) => v.key === 'en-full-b1');
    expect(en).toMatchObject({ kind: 'adaptation', timingStatus: 'exact', keyVocab: ['debt'], generation: { provider: 'fixture', model: 'test-model' }, evaluation: { verdict: 'ok' } });
    expect(en!.segments).toHaveLength(2);
    expect(en!.segments![0]).toMatchObject({ text: 'The adapted English paragraph.', fr: 'Le paragraphe anglais adapté.' });
    expect(en!.audio).toMatchObject({ origin: 'kokoro', source: 'r2', sha256: audioSha, sizeBytes: expect.any(Number) });
    expect(en!.audio!.playbackPath).toBe(`/api/contents/${CONTENT_ID}/variants/en-full-b1/audio?publication=${content!.publication.id}`);
    expect(en!.audio!.playbackPath).not.toMatch(/^https?:\/\//); // chemin relatif : jamais présenté comme une sauvegarde
    const fr = content!.variants.find((v) => v.key === 'fr-source');
    expect(fr!.audio).toBeNull();
    expect(fr!.segments![0]!.text).toContain('paragraphe source');
  });

  it('contient les dossiers avec leurs exécutions, et la file des préparations sans jetons', async () => {
    const data = await fetchExport();
    const dossier = data.dossiers.find((d) => d.id === dossierId);
    expect(dossier).toMatchObject({ title: 'Dette publique' });
    expect(dossier!.sources).toHaveLength(2);
    expect(dossier!.runs).toHaveLength(1);
    expect(dossier!.runs[0]!.sources.map((s) => s.id)).toEqual(['d1', 'd2']);
    expect(dossier!.runs[0]!.options).toMatchObject({ coverage: 'condensed', level: 'B1' });
    expect(dossier!.runs[0]!.preparation).toMatchObject({ status: 'pending', contentId: null });
    expect(data.preparations.some((p) => p.kind === 'dossier' && p.options.coverage === 'condensed')).toBe(true);
    expect(data.preparations.some((p) => p.kind === 'reflection' && p.status === 'done' && p.contentId === CONTENT_ID)).toBe(true);
  });

  it('ne contient aucun secret (sessions, connexions, push, jetons de bail)', async () => {
    const payload = await (await call('/api/export?v=2', { cookie })).json<Record<string, unknown>>();
    const text = JSON.stringify(payload);
    expect(Object.keys(payload).sort()).toEqual(['dictationAttempts', 'listeningReviews', 'appSettings', 'audioNotice', 'contents', 'dossiers', 'exportedAt', 'listeningProgress', 'markdown', 'preparations', 'reflections', 'savedEpisodes', 'schemaVersion', 'shows'].sort());
    for (const secret of ['session-secret-hmac', 'secret-bucket', 'secret-endpoint', 'secret-p256dh', 'secret-auth', 'secret-lease-token', 'mac-secret', ATELIER_TOKEN, PASSPHRASE]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/lease_token|leaseToken|lease_owner|leaseOwner|p256dh|login_attempts|loginAttempts|push_subscriptions|pushSubscriptions|session_id|sessionId/);
  });

  it('embarque un avertissement explicite sur les audios non inclus', async () => {
    const data = await fetchExport();
    expect(data.audioNotice).toContain('ne sont pas inclus');
    expect(data.audioNotice).toContain('SHA-256');
    expect(data.audioNotice).toContain('ce ne sont pas des sauvegardes');
  });

  it('mesure la taille produite (documentation des limites CPU du Worker gratuit)', async () => {
    const text = await (await call('/api/export?v=2', { cookie })).text();
    console.log(JSON.stringify({ event: 'export_size', bytes: text.length, kiloBytes: Math.round(text.length / 1024) }));
    expect(text.length).toBeGreaterThan(2000);
  });
});

describe('export v1 (inchangé)', () => {
  it('reste servi tel quel via ?v=1, sans les nouvelles sections', async () => {
    const res = await call('/api/export?v=1', { cookie });
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="discover-export-\d{4}-\d{2}-\d{2}\.json"/);
    const data = await res.json<Record<string, unknown>>();
    expect(Object.keys(data).sort()).toEqual(['exportedAt', 'markdown', 'reflections', 'savedEpisodes', 'schemaVersion', 'shows'].sort());
    expect(data.schemaVersion).toBe(1);
    expect((data.reflections as unknown[])).toHaveLength(3); // la corbeille reste exclue du v1
  });

  it('refuse une version inconnue', async () => {
    expect((await call('/api/export?v=3', { cookie })).status).toBe(400);
  });
});

describe('export Markdown', () => {
  it('se lit sans outil : notes, contenus bilingues, dossiers, annexes, avertissement audio', async () => {
    const res = await call('/api/export?v=2&format=markdown', { cookie });
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="discover-export-\d{4}-\d{2}-\d{2}\.md"/);
    const md = await res.text();
    expect(md).toContain('# Export Discover —');
    expect(md).toContain('## Mes notes');
    expect(md).toContain('Article · Le Monde');
    expect(md).toContain('Note en corbeille depuis le');
    expect(md).toContain('le dollar reste dominant');
    expect(md).toContain('## Contenus préparés');
    expect(md).toContain('#### en-full-b1 — adaptation (anglais, B1, narration)');
    expect(md).toContain('The adapted English paragraph.');
    expect(md).toContain('> Le paragraphe anglais adapté.');
    expect(md).toContain('#### fr-source — transcription source (français)');
    expect(md).toContain(`SHA-256 \`${audioSha}\``);
    expect(md).toContain('## Dossiers');
    expect(md).toContain('Sources capturées :');
    expect(md).toContain('## Émissions suivies');
    expect(md).toContain('Chaîne tech');
    expect(md).toContain('## Progression d’écoute');
    expect(md).toContain('ce ne sont pas des sauvegardes');
    // Le Markdown embarqué dans le JSON est le même document.
    const data = await fetchExport();
    expect(data.markdown).toBe(md);
  });
});


describe('robustesse de l’export', () => {
  it('préserve le v1 par défaut et refuse les paramètres invalides du v2', async () => {
    expect((await (await call('/api/export', { cookie })).json<{ schemaVersion: number }>()).schemaVersion).toBe(1);
    for (const query of ['page=-1', 'page=', 'page=1.5', 'page=Infinity', 'page=1000001', 'format=zip', 'page=0&format=markdown']) {
      expect((await call(`/api/export?v=2&${query}`, { cookie })).status).toBe(400);
    }
    expect((await call('/api/export?v=2')).status).toBe(401);
  });

  it('pagine toutes les préparations au-delà de 500 sans perdre de notes aux dates identiques', async () => {
    for (let start = 0; start < 501; start += 50) {
      await env.DB.batch(Array.from({ length: Math.min(50, 501 - start) }, (_, i) => env.DB.prepare(
        `INSERT INTO prepare_queue (id,kind,ref,options_json,status,created_at,updated_at)
         VALUES (?, 'reflection', ?, '{}', 'cancelled', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z')`,
      ).bind(`history-${start + i}`, `ref-${start + i}`)));
    }
    await env.DB.batch(Array.from({ length: 101 }, (_, i) => env.DB.prepare(
      `INSERT INTO reflections (id,title,body_md,created_at,updated_at)
       VALUES (?, 'Note paginée', 'Texte conservé', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z')`,
    ).bind(`page-note-${i}`)));
    const full = await fetchExport();
    const collected: string[] = [], notes: string[] = [];
    let page = 0, maxBytes = 0;
    const started = Date.now();
    for (;;) {
      const res = await call(`/api/export?v=2&page=${page}`, { cookie });
      expect(res.status).toBe(200);
      const raw = await res.text();
      maxBytes = Math.max(maxBytes, new TextEncoder().encode(raw).length);
      const data = JSON.parse(raw) as ExportPayload & { pagination: { page: number; hasMore: boolean }; markdownSections: Record<string, string>;
      };
      expect(data.contents.length).toBeLessThanOrEqual(1);
      expect(data.dossiers.length).toBeLessThanOrEqual(1);
      expect(data.preparations.length).toBeLessThanOrEqual(50);
      expect(data.pagination.page).toBe(page);
      expect(raw).not.toContain('secret-lease-token');
      expect(raw).not.toContain('session-secret-hmac');
      collected.push(...data.preparations.map(item => item.id));
      notes.push(...data.reflections.map(note => note.id));
      if (!data.pagination.hasMore) break;
      page++;
      expect(page).toBeLessThan(20);
    }
    expect(collected).toHaveLength(503);
    expect(new Set(collected).size).toBe(503);
    expect(new Set(notes).size).toBe(105);
    expect(notes).toHaveLength(full.reflections.length);
    expect(collected.length).toBe(full.preparations.length);
    expect(page + 1).toBe(11);
    expect(maxBytes).toBeLessThan(100_000);
    console.log(JSON.stringify({ event: 'export_pagination', pages: page + 1, maxPageBytes: maxBytes, elapsedWallMs: Date.now() - started }));
  });

  it('signale un manifeste manquant sans perdre les métadonnées ni les autres données', async () => {
    await env.DB.prepare("UPDATE publications SET manifest_r2_key='missing-export-manifest' WHERE content_id=?").bind(CONTENT_ID).run();
    const data = await fetchExport();
    expect(data.contents[0]).toMatchObject({ id: CONTENT_ID, error: 'manifest_unavailable' });
    expect(data.reflections).toHaveLength(4);
    expect(data.markdown).toContain('Publication indisponible');
  });

  it('signale des segments absents ou illisibles et conserve la variante', async () => {
    const file = await env.DB.prepare("SELECT r2_key FROM publication_files WHERE path='segments/en-full-b1.json'").first<{ r2_key: string }>();
    const original = await (await env.FILES.get(file!.r2_key))!.text();
    try {
      await env.FILES.delete(file!.r2_key);
      let data = await fetchExport();
      expect(data.contents[0]!.variants.find(v => v.key === 'en-full-b1')).toMatchObject({ segments: null, segmentsError: 'file_missing' });
      await env.FILES.put(file!.r2_key, JSON.stringify({ invalid: true }));
      data = await fetchExport();
      expect(data.contents[0]!.variants.find(v => v.key === 'en-full-b1')).toMatchObject({ segments: null, segmentsError: 'unreadable' });
    } finally {
      await env.FILES.put(file!.r2_key, original);
    }
  });

  it('conserve le texte capturé des sources du dossier dans le Markdown', async () => {
    expect((await fetchExport()).markdown).toContain('Une réflexion assez longue sur la dette publique et sa soutenabilité.');
  });
});
