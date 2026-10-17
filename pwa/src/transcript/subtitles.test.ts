import { describe, expect, it } from 'vitest';
import { activeSegment, groupCues, isSynced, parseCues, parseTranscript } from './subtitles';

const SRT = `1
00:00:02,520 --> 00:00:04,200
Speaker 1: Bloomberg Audio Studios.

2
00:00:04,670 --> 00:00:05,380
Speaker 2: Podcasts.

3
00:00:12,990 --> 00:00:16,530
Speaker 4: Bloomberg Tech is live from the heart of Silicon Valley

4
00:00:17,050 --> 00:00:19,310
Speaker 4: with Ed Ludlow in San Francisco.
`;

const VTT = `WEBVTT

00:01.000 --> 00:03.500
<v Stéphane>Bonjour et bienvenue

00:03.600 --> 00:06.000
<v Stéphane>dans T'as qui en Histoire ?

01:02:03.250 --> 01:02:05.000
La suite &amp; la fin.
`;

describe('analyse SRT/VTT', () => {
  it('lit les horodatages, les intervenants et le texte (SRT)', () => {
    const cues = parseCues(SRT);
    expect(cues).toHaveLength(4);
    expect(cues[0]).toEqual({ startMs: 2520, endMs: 4200, speaker: 'Speaker 1', text: 'Bloomberg Audio Studios.' });
  });

  it('lit le WebVTT (heures facultatives, balises <v>, entités)', () => {
    const cues = parseCues(VTT);
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 3500, speaker: 'Stéphane', text: 'Bonjour et bienvenue' });
    expect(cues[2]).toMatchObject({ startMs: 3_723_250, text: 'La suite & la fin.' });
  });

  it('regroupe les répliques d’un même intervenant, coupe au changement d’intervenant et après une pause', () => {
    const segs = parseTranscript(SRT);
    expect(segs.map((s) => [s.id, s.speaker, s.text])).toEqual([
      ['s001', 'Speaker 1', 'Bloomberg Audio Studios.'],
      ['s002', 'Speaker 2', 'Podcasts.'],
      ['s003', 'Speaker 4', 'Bloomberg Tech is live from the heart of Silicon Valley with Ed Ludlow in San Francisco.'],
    ]);
    expect(segs[2]).toMatchObject({ startMs: 12_990, endMs: 19_310 });
  });

  it('ne dépasse pas beaucoup la taille cible et ne coupe jamais une réplique', () => {
    const cues = Array.from({ length: 40 }, (_, i) => ({ startMs: i * 2000, endMs: i * 2000 + 1900, speaker: 'A', text: `Phrase numéro ${i}.` }));
    const segs = groupCues(cues, 60);
    expect(segs.length).toBeGreaterThan(5);
    expect(segs.every((s) => s.text.length < 60 * 1.6 + 20)).toBe(true);
    expect(segs.map((s) => s.text).join(' ')).toBe(cues.map((c) => c.text).join(' '));
  });
});

describe('lecture synchronisée', () => {
  const segs = parseTranscript(SRT);

  it('trouve le segment en cours', () => {
    expect(activeSegment(segs, 0)).toBe(-1);
    expect(activeSegment(segs, 4_700)).toBe(1);
    expect(activeSegment(segs, 15_000)).toBe(2);
    expect(activeSegment(segs, 999_999)).toBe(2);
  });

  it('n’active le surlignage que si la durée réelle correspond (±1,5 s)', () => {
    expect(isSynced(2598.4, 2598)).toBe(true);
    expect(isSynced(2630, 2598)).toBe(false);
    expect(isSynced(2598, null)).toBe(false);
    expect(isSynced(Number.NaN, 2598)).toBe(false);
  });
});
