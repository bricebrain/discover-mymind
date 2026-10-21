import { describe, expect, it } from 'vitest';
import youtube from '../../contracts/fixtures/valid-youtube.json';
import { HttpError } from '../src/http';
import { validateManifest } from '../src/publications/validation';
import { prepareOptions } from '../src/queue/options';
import { plannedStages } from '../src/queue/progress';

const QUIZ = [0, 1, 2].map((i) => ({ question: `Question ${i}?`, choices: ['A', 'B', 'C'], correctChoice: 0, explanation: 'Parce que.', segmentIndex: 0 }));
const refused = (run: () => unknown) => {
  try { run(); expect.fail('Accepté'); } catch (e) { expect(e).toBeInstanceOf(HttpError); expect((e as HttpError).code).toBe('invalid_options'); }
};

describe('Original guidé', () => {
  it('accepte la formule guidée sans durée cible, avec un niveau d’explication', () => {
    expect(prepareOptions({ coverage: 'guided', level: 'B1' }, 'en', 600)).toEqual(
      { coverage: 'guided', level: 'B1', style: 'narration', targetMinutes: null, faithful: false, keepOriginalCopy: false });
    expect(prepareOptions({ coverage: 'guided', level: 'A2' }, 'fr', 3600).coverage).toBe('guided');
  });

  it('refuse une durée cible, un dialogue ou l’anglais non simplifié', () => {
    refused(() => prepareOptions({ coverage: 'guided', level: 'B1', targetMinutes: 4 }, 'en', 600));
    refused(() => prepareOptions({ coverage: 'guided', level: 'B1', style: 'dialogue' }, 'en', 600));
    refused(() => prepareOptions({ coverage: 'guided', level: 'original' }, 'en', 600));
  });

  it('garde le quiz d’une version anglaise, même originale, et l’écarte en français', () => {
    const en = structuredClone(youtube) as unknown as { variants: Record<string, unknown>[] };
    en.variants[0]!.quiz = QUIZ;
    expect(validateManifest(en).variants[0]!.quiz).toEqual(QUIZ);
    const fr = structuredClone(youtube) as unknown as { content: Record<string, unknown>; variants: Record<string, unknown>[] };
    fr.content.originalLanguage = 'fr'; fr.variants[0]!.language = 'fr'; fr.variants[0]!.quiz = QUIZ;
    expect(validateManifest(fr).variants[0]!.quiz).toBeUndefined();
  });

  it('prévoit traduction, voix éventuelle et guide, sans plan ni adaptation', () => {
    expect(plannedStages({ kind: 'youtube', executor: 'mac', options_json: JSON.stringify({ coverage: 'guided' }) } as never))
      .toEqual(['download', 'normalize', 'transcribe', 'translate', 'tts', 'guide', 'publish']);
  });
});
