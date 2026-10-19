import { describe, expect, it } from 'vitest';
import type { ContentDetail, ContentVariant } from '../api/contents';
import type { DownloadRecord, DownloadStatus } from '../offline';
import { nextDownload, readAutoplayNext, trackFromDownload, writeAutoplayNext } from './nextUp';

const variant = (key: string, audio: boolean): ContentVariant => ({
  key, kind: 'adaptation', language: 'en', cefrLevel: 'B1', segmentsUrl: `/seg/${key}`, timingStatus: 'exact',
  audio: audio ? { source: 'r2', url: `/audio/${key}.mp3`, sha256: `sha-${key}`, durationMs: 60_000, timingSource: 'kokoro' } : null,
});
const record = (key: string, status: DownloadStatus = 'complete', withAudio = true): DownloadRecord => {
  const [contentId, variantKey] = [key.split(':')[0]!, key.split(':')[1]!];
  const v = variant(variantKey, withAudio);
  const detail: ContentDetail = { content: { id: contentId, title: `Titre ${contentId}` }, publicationId: 'pub', variants: [v] };
  return { key, contentId, variantKey, publicationId: 'pub', title: `Titre ${contentId}`, label: 'Intégral B1 · Anglais',
    audioRef: v.audio?.sha256 ?? null, audioBytes: withAudio ? 100 : 0, textBytes: 10, status, detail,
    segments: { schemaVersion: 1, variantKey, segments: [] }, createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z' };
};

// Ordre de la liste des téléchargements : la plus récemment mise à jour en premier.
const localAudio = (ref: string) => `blob:${ref}`;
const records = [record('c3:en-b1'), record('c1:en-b1'), record('c2:en-b1', 'failed'), record('c4:en-b1')];

describe('ordre d’enchaînement', () => {
  it('suit la liste des téléchargements, en sautant les versions non terminées', () => {
    expect(nextDownload(records, 'c3:en-b1', localAudio)?.key).toBe('c1:en-b1');
    expect(nextDownload(records, 'c1:en-b1', localAudio)?.key).toBe('c4:en-b1');
  });
  it('saute textes seuls, fichiers absents et empreintes incompatibles', () => {
    const first = record('first:v1');
    const missing = record('missing:v2');
    const mismatch = { ...record('mismatch:v3'), audioRef: 'autre-audio' };
    const last = record('last:v4');
    const list = [first, record('text:v0', 'complete', false), missing, mismatch, last];
    expect(nextDownload(list, first.key, (ref) => ref === missing.audioRef ? undefined : localAudio(ref))).toBe(last);
    expect(nextDownload(list, first.key, () => undefined)).toBeNull();
  });
  it('s’arrête en fin de liste, sans reboucler', () => {
    expect(nextDownload(records, 'c4:en-b1', localAudio)).toBeNull();
  });
  it('n’enchaîne pas depuis une piste absente de la liste ni sans piste courante', () => {
    expect(nextDownload(records, 'c2:en-b1')).toBeNull(); // échec : pas une version jouable
    expect(nextDownload(records, 'zz:en-b1')).toBeNull();
    expect(nextDownload(records, null)).toBeNull();
  });
});

describe('piste de la version suivante', () => {
  it('reprend la cible et l’empreinte de la version téléchargée', () => {
    const t = trackFromDownload(record('c1:en-b1'), localAudio);
    expect(t).toMatchObject({ targetType: 'variant', targetId: 'c1:en-b1', audioRef: 'sha-en-b1', durationSec: 60 });
  });
  it('joue le fichier local et refuse tout repli vers le réseau', () => {
    expect(trackFromDownload(record('c1:en-b1'), localAudio)?.src).toBe('blob:sha-en-b1');
    expect(trackFromDownload(record('c1:en-b1'), () => undefined)).toBeNull();
    expect(trackFromDownload(record('c9:en-b1', 'complete', false))).toBeNull();
  });
});

describe('réglage « lire ensuite »', () => {
  it('est désactivé par défaut et persiste le choix explicite', () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    };
    expect(readAutoplayNext(fake)).toBe(false);
    writeAutoplayNext(true, fake);
    expect(readAutoplayNext(fake)).toBe(true);
    writeAutoplayNext(false, fake);
    expect(readAutoplayNext(fake)).toBe(false);
  });
  it('supporte un stockage indisponible', () => {
    const broken = {
      getItem: () => { throw new Error('refusé'); },
      setItem: () => { throw new Error('refusé'); },
      removeItem: () => { throw new Error('refusé'); },
    };
    expect(readAutoplayNext(broken)).toBe(false);
    expect(() => writeAutoplayNext(true, broken)).not.toThrow();
    writeAutoplayNext(false, broken);
    expect(readAutoplayNext(undefined)).toBe(false);
    writeAutoplayNext(true, broken);
    expect(readAutoplayNext(broken)).toBe(true);
    writeAutoplayNext(false, broken);
  });
});
