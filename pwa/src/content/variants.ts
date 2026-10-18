import type { ContentDetail, ContentSegment, ContentSegments, ContentVariant } from '../api/contents';
import type { Track } from '../player/types';
import { offline } from '../offline/index';
import { isSynced } from '../transcript/subtitles';

export function variantName(v: ContentVariant): string {
  if (v.kind === 'source') return 'Original';
  if (v.kind === 'faithful_translation') return 'Fidèle';
  const name = v.coverage === 'condensed' ? 'Condensé' : v.coverage === 'essentials' ? 'L’essentiel' : 'Intégral';
  return v.cefrLevel ? `${name} ${v.cefrLevel}` : name;
}
export const languageName = (language: string) => ({ fr: 'Français', en: 'Anglais' })[language.split('-')[0]!] ?? language;
export function durationLabel(ms: number): string {
  const seconds = Math.round(ms / 1000), minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return minutes ? `${minutes} min${rest ? ` ${rest} s` : ''}` : `${seconds} s`;
}
export function variantLabel(v: ContentVariant): string {
  const language = languageName(v.language) + (v.kind === 'adaptation' && !v.cefrLevel ? ' non simplifié' : '');
  const style = v.kind === 'adaptation' && v.style === 'dialogue' ? ' · Dialogue' : '';
  return `${variantName(v)} · ${language} · ${v.audio ? durationLabel(v.audio.durationMs) : 'Texte seul'}${style}`;
}
export function variantTrack(detail: ContentDetail, v: ContentVariant): Track | null {
  // Audio local seulement s'il a exactement la même empreinte que la version affichée.
  const local = v.audio?.sha256 ? offline.audioUrl(v.audio.sha256) : undefined;
  return v.audio ? { targetType: 'variant', targetId: `${detail.content.id}:${v.key}`,
    audioRef: v.audio.sha256 ?? v.audio.url, src: local ?? v.audio.url, title: detail.content.title,
    subtitle: `${variantName(v)} · ${languageName(v.language)}`, imageUrl: null, durationSec: v.audio.durationMs / 1000 } : null;
}
export function timingVerified(v: ContentVariant, actualDurationSec: number): boolean {
  return !!v.audio && v.audio.timingSource !== 'none' && v.timingStatus !== 'none'
    && (v.timingStatus === 'exact' || isSynced(actualDurationSec, v.audio.durationMs / 1000));
}
export function activeContentSegment(segments: ContentSegment[], positionMs: number | null): number {
  if (positionMs === null || !Number.isFinite(positionMs)) return -1;
  let lo = 0, hi = segments.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, start = segments[mid]!.startMs;
    if (start === null) return -1;
    if (start <= positionMs) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const segment = segments[found];
  return segment && segment.endMs !== null && positionMs < segment.endMs ? found : -1;
}

function isFrenchCompanion(active: ContentVariant, other: ContentVariant): boolean {
  if (other.language.split('-')[0] !== 'fr' || active.language.split('-')[0] === 'fr') return false;
  return (other.kind === 'faithful_translation' && other.derivedFrom === active.key)
    || (active.kind === 'faithful_translation' && active.derivedFrom === other.key && other.kind === 'source');
}
export function frenchCompanion(active: ContentVariant, variants: ContentVariant[]): ContentVariant | undefined {
  return variants.find((other) => isFrenchCompanion(active, other));
}
/** Appariement par identifiants uniquement ; aucune traduction de la source appliquée à une adaptation. */
export function frenchBySegment(active: ContentVariant, doc: ContentSegments, companion?: ContentVariant, translated?: ContentSegments): Map<string, string> {
  const result = new Map<string, string>();
  if (doc.variantKey !== active.key || active.language.split('-')[0] === 'fr') return result;
  const paired = companion && translated?.variantKey === companion.key && isFrenchCompanion(active, companion)
    ? new Map(translated.segments.map((s) => [s.id, s.text])) : new Map<string, string>();
  for (const s of doc.segments) {
    const fr = s.fr?.trim() || paired.get(s.id)?.trim();
    if (fr) result.set(s.id, fr);
  }
  return result;
}
