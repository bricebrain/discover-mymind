const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Jeton aléatoire de 256 bits, encodé en base64url. */
export function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = '';
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmacRaw(key: string, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, encoder.encode(message));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  return toHex(await hmacRaw(key, message));
}

/**
 * Compare deux secrets en temps constant : on compare leurs HMAC (même longueur),
 * jamais les chaînes elles-mêmes.
 */
export async function secretsEqual(key: string, a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmacRaw(key, a), hmacRaw(key, b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}
