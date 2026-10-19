import { HttpError } from '../http';

export const KINDS = ['idea', 'question', 'opinion', 'observation', 'synthesis'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MAX_BODY = 100_000;
export const TRASH_RETENTION_MS = 30 * 86_400_000;

export function validId(id: string): string {
  if (!UUID.test(id)) throw new HttpError(400, 'invalid_id', 'Identifiant de note invalide (UUID attendu).');
  return id;
}

export function text(v: unknown, name: string, max: number, nullable = true): string | null {
  if (v === undefined || v === null) {
    if (nullable) return null;
    throw new HttpError(400, 'invalid_body', `${name} attendu.`);
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'invalid_body', `${name} : texte de ${max} caractères au plus.`);
  return v;
}

export function kind(v: unknown): string {
  if (v === undefined) return 'idea';
  if (typeof v !== 'string' || !(KINDS as readonly string[]).includes(v)) throw new HttpError(400, 'invalid_body', `Type attendu : ${KINDS.join(', ')}.`);
  return v;
}

/** Origine d'une note : réflexion personnelle ou article (attribué à sa publication). */
export function origin(v: unknown): 'personal' | 'article' {
  if (v === undefined) return 'personal';
  if (v !== 'personal' && v !== 'article') throw new HttpError(400, 'invalid_body', 'Origine : personal ou article.');
  return v;
}
export function sourceUrl(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.length > 2048) throw new HttpError(400, 'invalid_body', 'Lien : 2 048 caractères au plus.');
  let url: URL;
  try { url = new URL(v.trim()); } catch { throw new HttpError(400, 'invalid_body', 'Lien de l’article invalide.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'invalid_body', 'Lien http(s) attendu.');
  return url.toString();
}
export const sourceName = (v: unknown) => (v === '' ? null : text(v, 'Journal', 120));

export function tags(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20 || v.some((t) => typeof t !== 'string' || t.trim() === '' || t.length > 40)) {
    throw new HttpError(400, 'invalid_body', 'Tags : 20 au plus, 40 caractères chacun.');
  }
  return [...new Set(v.map((t: string) => t.trim()))];
}

export const QUESTION_STATES = ['to_explore', 'thinking', 'deepened'] as const;
export function questionState(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !(QUESTION_STATES as readonly string[]).includes(value)) {
    throw new HttpError(400, 'invalid_body', 'État de question : to_explore, thinking ou deepened.');
  }
  return value;
}
