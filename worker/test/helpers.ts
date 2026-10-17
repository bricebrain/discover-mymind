import { exports } from 'cloudflare:workers';

export const ORIGIN = 'https://discover.test';
export const PASSPHRASE = 'test-passphrase-long-enough-1234';
export const ATELIER_TOKEN = 'test-atelier-token-0123456789abcdef';

export interface CallOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  /** false : n'ajoute pas les en-têtes CSRF de la PWA. */
  pwa?: boolean;
  ip?: string;
}

export function call(path: string, o: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'CF-Connecting-IP': o.ip ?? '203.0.113.7', ...o.headers };
  if (o.pwa !== false) {
    headers.Origin ??= ORIGIN;
    headers['X-Discover-Client'] ??= '1';
  }
  if (o.body !== undefined) headers['Content-Type'] ??= 'application/json';
  if (o.cookie) headers.Cookie = o.cookie;
  return exports.default.fetch(new Request(ORIGIN + path, {
    method: o.method ?? 'GET',
    headers,
    body: o.body === undefined ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body),
  }));
}

/** Connexion réussie → cookie « nom=valeur » à renvoyer. */
export async function login(ip?: string): Promise<string> {
  const res = await call('/api/auth/login', { method: 'POST', body: { passphrase: PASSPHRASE }, ip });
  if (res.status !== 200) throw new Error(`login ${res.status}: ${await res.text()}`);
  const set = res.headers.get('Set-Cookie') ?? '';
  return set.split(';')[0] ?? '';
}
