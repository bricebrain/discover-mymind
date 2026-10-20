/** Erreur renvoyée par l'API : `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) {
    super(message);
  }
}

/**
 * Appel à l'API du Worker (même origine). Toute écriture porte les en-têtes
 * exigés par la protection CSRF (§ 8.3) ; le cookie de session est envoyé automatiquement.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; onResponse?: (response: Response) => void } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-Discover-Client'] = '1';
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: method === 'GET' ? undefined : JSON.stringify(init.body ?? {}),
    });
  } catch {
    throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ton réseau.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    const retry = Number(res.headers.get('Retry-After') ?? '') || undefined;
    throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? `Erreur ${res.status}`, retry);
  }
  init.onResponse?.(res);
  return data as T;
}
