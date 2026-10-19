import { describe, expect, it } from 'vitest';
import invalid from '../../contracts/fixtures/invalid-manifests.json';
import invalidSegments from '../../contracts/fixtures/invalid-segments.json';
import deepgram from '../../contracts/fixtures/valid-deepgram.json';
import youtube from '../../contracts/fixtures/valid-youtube.json';
import podcastFr from '../../contracts/fixtures/valid-podcast-fr.json';
import podcastHttp from '../../contracts/fixtures/valid-podcast-http.json';
import podcastEn from '../../contracts/fixtures/valid-podcast-en.json';
import condensed from '../../contracts/fixtures/valid-condensed.json';
import reflection from '../../contracts/fixtures/valid-reflection.json';
import dossierArticle from '../../contracts/fixtures/valid-dossier-article.json';
import dossier from '../../contracts/fixtures/valid-dossier.json';
import { HttpError } from '../src/http';
import type { Variant } from '../src/publications/types';
import { validateManifest, validateSegments, canonicalJson } from '../src/publications/validation';

describe('Contrat partagé TS/Python', () => {
  for (const m of [deepgram,youtube,podcastFr,podcastEn,podcastHttp,reflection,condensed,dossier,dossierArticle]) it(m.content.id, () => expect(validateManifest(m)).toEqual(m));
  for (const f of invalid) it(f.name, () => {
    try { validateManifest(f.manifest,'context' in f ? f.context : {}); expect.fail('Manifeste accepté'); }
    catch (e) { expect(e).toBeInstanceOf(HttpError); expect((e as HttpError).code).toBe(f.code); }
  });
  for (const f of invalidSegments) it(f.name, () => {
    try { validateSegments(f.document,f.variant as Variant); expect.fail('Segments acceptés'); }
    catch (e) { expect(e).toBeInstanceOf(HttpError); expect((e as HttpError).code).toBe(f.code); }
  });
  it('normalise récursivement les clés sans changer les tableaux', () => {
    expect(canonicalJson({ z:[{ b:2,a:1 }], a:'é' })).toBe('{"a":"é","z":[{"a":1,"b":2}]}');
  });
});
