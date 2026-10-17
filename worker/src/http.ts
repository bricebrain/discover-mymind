/** En-têtes appliqués à toutes les réponses de l'API (§ 8.3). */
const API_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

export function noContent(headers: HeadersInit = {}): Response {
  return new Response(null, { status: 204, headers });
}

export function apiError(status: number, code: string, message: string, headers: HeadersInit = {}): Response {
  return json({ error: { code, message } }, status, headers);
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Lit un corps JSON en plafonnant sa taille ; lève HttpError(400/413). */
export async function readJson<T = unknown>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', 'Corps de requête trop volumineux.');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, 'payload_too_large', 'Corps de requête trop volumineux.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON invalide.');
  }
}
