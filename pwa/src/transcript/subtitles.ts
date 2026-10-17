/**
 * Transcriptions SRT/VTT fournies par les flux → segments lisibles.
 * Les répliques (cues) de 2 à 4 s sont regroupées en segments d'environ 220 caractères,
 * sans jamais couper une réplique : nouveau segment à chaque changement d'intervenant
 * ou après une pause de plus de 1,5 s (même règle que horodatage.py dans l'Atelier).
 */

export interface Cue {
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
}

export interface Segment {
  id: string;
  speaker: string | null;
  text: string;
  startMs: number;
  endMs: number;
}

const TIMING = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
// Intervenant : balise WebVTT <v Nom>, ou préfixe « Speaker 2: » (forme des transcriptions automatiques).
const SPEAKER = /^\s*(?:<v\s+([^>]+)>|((?:Speaker|Intervenant|Locuteur)\s*\d+)\s*:\s+)/u;

function toMs(h: string | undefined, m: string, s: string, frac: string): number {
  return ((Number(h ? h.slice(0, -1) : 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(frac.padEnd(3, '0').slice(0, 3));
}

function clean(text: string): string {
  return text.replace(/<\/?[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

/** SRT et WebVTT : même structure (bloc = horodatage + lignes de texte). */
export function parseCues(raw: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => TIMING.test(l));
    if (i === -1) continue;
    const t = lines[i]!.match(TIMING)!;
    let text = lines.slice(i + 1).join(' ');
    let speaker: string | null = null;
    const sp = text.match(SPEAKER);
    if (sp) {
      speaker = (sp[1] ?? sp[2] ?? '').trim() || null;
      text = text.slice(sp[0].length);
    }
    text = clean(text);
    if (!text) continue;
    cues.push({ startMs: toMs(t[1], t[2]!, t[3]!, t[4]!), endMs: toMs(t[5], t[6]!, t[7]!, t[8]!), speaker, text });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}

export function groupCues(cues: Cue[], target = 220, maxGapMs = 1500): Segment[] {
  const segments: Segment[] = [];
  let cur: Omit<Segment, 'id'> | null = null;
  const flush = () => {
    if (cur) segments.push({ id: `s${String(segments.length + 1).padStart(3, '0')}`, ...cur });
    cur = null;
  };
  for (const c of cues) {
    const sameSpeaker = cur !== null && (c.speaker === null || c.speaker === cur.speaker);
    const gapOk = cur !== null && c.startMs - cur.endMs <= maxGapMs;
    const sentenceEnd = cur !== null && /[.!?…]["»”)]?$/.test(cur.text);
    if (cur && sameSpeaker && gapOk && !(cur.text.length >= target && sentenceEnd) && cur.text.length < target * 1.6) {
      cur.text = `${cur.text} ${c.text}`;
      cur.endMs = Math.max(cur.endMs, c.endMs);
    } else {
      flush();
      cur = { speaker: c.speaker, text: c.text, startMs: c.startMs, endMs: c.endMs };
    }
  }
  flush();
  return segments;
}

export const parseTranscript = (raw: string): Segment[] => groupCues(parseCues(raw));

/** Index du segment en cours de lecture (le dernier commencé), ou -1. */
export function activeSegment(segments: Segment[], positionMs: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.startMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Le surlignage n'est fiable que si l'audio lu a la durée de celui qui a été transcrit (§ 7.3) :
 * avec des publicités insérées à la volée, le fichier diffusé peut être plus long ou plus court.
 */
export const SYNC_TOLERANCE_MS = 1500;
export function isSynced(actualDurationSec: number, referenceDurationSec: number | null): boolean {
  if (!referenceDurationSec || !Number.isFinite(actualDurationSec) || actualDurationSec <= 0) return false;
  return Math.abs(actualDurationSec - referenceDurationSec) * 1000 <= SYNC_TOLERANCE_MS;
}
