import { HttpError } from '../http';

export const normalize = (s: string) => s.trim().replace(/\s+/gu,' ').toLowerCase();
export type Selection = { word: string; sentence: string; contentId: string; publicationId: string;
  variantKey: string; segmentIndex: number; language: 'en' };
export function selection(value: unknown): Selection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const b = value as Record<string,unknown>;
  for (const [key,max] of [['word',120],['sentence',4000],['contentId',96],['publicationId',36],['variantKey',32]] as const) {
    if (typeof b[key] !== 'string' || !b[key].trim() || b[key].length > max) invalid();
  }
  if (b.language !== 'en' || !Number.isSafeInteger(b.segmentIndex) || Number(b.segmentIndex)<0 ||
      !/^[a-z0-9-]{3,96}$/.test(String(b.contentId)) || !/^[0-9a-f-]{36}$/.test(String(b.publicationId)) ||
      !/^[a-z0-9-]{2,32}$/.test(String(b.variantKey)) || normalize(String(b.word)).split(' ').length>8) invalid();
  return { word: String(b.word).trim().replace(/\s+/gu,' '), sentence: String(b.sentence).trim(),
    contentId: String(b.contentId), publicationId: String(b.publicationId), variantKey: String(b.variantKey),
    segmentIndex: Number(b.segmentIndex), language: 'en' };
}
function invalid(): never { throw new HttpError(400,'invalid_pick','Sélection de vocabulaire invalide.'); }
