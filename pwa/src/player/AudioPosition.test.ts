import { describe, expect, it } from 'vitest';
import type { ListeningProgress } from '../api/progress';
import { AudioPosition } from './AudioPosition';
import { sameAudio, type Track } from './types';

class FakeMedia extends EventTarget {
  currentTime = 0;
  duration = 120;
  readyState = 0;
  metadata() { this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')); }
}
const progress = (positionMs: number, completed = false): ListeningProgress => ({ positionMs, completed, durationMs: 120000 });
function deferred() {
  let resolve!: (p: ListeningProgress | null) => void;
  const promise = new Promise<ListeningProgress | null>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); }

describe('position audio et reprises concurrentes', () => {
  it('attend les métadonnées avant de restaurer et d’autoriser la sauvegarde', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a);
    position.restore(Promise.resolve(progress(42000))); await flush();
    expect(position.ready).toBe(false); expect(a.currentTime).toBe(0);
    a.metadata(); expect(position.ready).toBe(true); expect(a.currentTime).toBe(42);
  });
  it('une reprise lente d’une ancienne version ne déplace jamais la suivante', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a), old = deferred();
    position.restore(old.promise);
    position.restore(Promise.resolve(progress(20000))); a.metadata(); await flush();
    old.resolve(progress(70000)); await flush(); expect(a.currentTime).toBe(20);
  });
  it('annule aussi un ancien saut déjà en attente de métadonnées', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a);
    position.restore(Promise.resolve(progress(70000))); await flush();
    position.restore(Promise.resolve(null), 30);
    a.metadata(); expect(a.currentTime).toBe(30);
  });
  it('le passage touché prend priorité sur la progression stockée, y compris à zéro', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a); a.metadata();
    position.restore(Promise.resolve(progress(70000)), 0); await flush(); expect(a.currentTime).toBe(0);
  });
  it('un saut manuel annule la reprise réseau qui arriverait ensuite', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a), pending = deferred(); a.metadata();
    position.restore(pending.promise); position.seek(18);
    pending.resolve(progress(80000)); await flush(); expect(a.currentTime).toBe(18);
  });
  it('annule les actions en attente après la fermeture du lecteur', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a), pending = deferred();
    position.restore(pending.promise); position.reset(); a.metadata(); pending.resolve(progress(70000)); await flush();
    expect(position.ready).toBe(false); expect(a.currentTime).toBe(0);
  });
  it('relit depuis zéro un audio terminé ou sans progression accessible', async () => {
    const a = new FakeMedia(), position = new AudioPosition(a); a.metadata();
    position.restore(Promise.resolve(progress(120000, true))); await flush(); expect(a.currentTime).toBe(0);
    position.restore(Promise.reject(new Error('offline'))); await flush(); expect(a.currentTime).toBe(0); expect(position.ready).toBe(true);
  });
  it('borne les sauts à la durée réelle et ignore les valeurs non finies', () => {
    const a = new FakeMedia(), position = new AudioPosition(a); a.metadata();
    position.seek(999); expect(a.currentTime).toBe(120);
    position.seek(-20); expect(a.currentTime).toBe(0);
    position.seek(12); position.seek(Number.NaN); expect(a.currentTime).toBe(12);
  });
});

it('un changement d’empreinte d’une même variante impose le chargement du nouvel audio', () => {
  const a: Track = { targetType:'variant',targetId:'content:en-b1',audioRef:'sha-old',src:'/audio?publication=old',title:'Titre',subtitle:'B1',durationSec:120,imageUrl:null };
  expect(sameAudio(a,{ ...a,audioRef:'sha-new' })).toBe(false);
  expect(sameAudio(a,{ ...a,src:'/audio?publication=new' })).toBe(true);
  expect(sameAudio(a,{ ...a,targetId:'content:en-condensed' })).toBe(false);
});
