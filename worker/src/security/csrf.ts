import { HttpError } from '../http';

export const CLIENT_HEADER = 'X-Discover-Client';
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Contrôles CSRF des requêtes /api qui modifient quelque chose (§ 8.3) :
 * même origine, en-tête X-Discover-Client: 1 et corps JSON.
 * Un formulaire ou une image d'un autre site ne peut réunir aucune de ces conditions.
 */
export function assertSameOriginWrite(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;

  const expected = new URL(req.url).origin;
  const origin = req.headers.get('Origin');
  if (origin !== null ? origin !== expected : req.headers.get('Sec-Fetch-Site') !== 'same-origin') {
    throw new HttpError(403, 'csrf_origin', 'Origine de la requête refusée.');
  }
  if (req.headers.get(CLIENT_HEADER) !== '1') {
    throw new HttpError(403, 'csrf_client', 'En-tête client manquant.');
  }
  if (BODY_METHODS.has(req.method)) {
    const type = (req.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json') throw new HttpError(415, 'unsupported_media_type', 'Corps JSON attendu.');
  }
}
