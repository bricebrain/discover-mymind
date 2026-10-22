import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ATELIER_TOKEN, call, login, ORIGIN, PASSPHRASE } from './helpers';

// Le stockage D1 est partagé entre les tests d'un fichier : chaque test part de tables vides.
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM login_attempts')]);
});

describe('schéma', () => {
  it('les migrations créent toutes les tables du modèle', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table') AND name NOT LIKE 'search_index_%' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations'",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual([
      'app_settings', 'article_sources', 'articles', 'cloud_guards', 'cloud_operations', 'cloud_quotes', 'cloud_runs', 'contents', 'dictation_attempts', 'dossier_runs', 'dossiers', 'episodes', 'level_feedback', 'listening_progress', 'login_attempts', 'prepare_queue', 'publication_files', 'publication_gc', 'publication_guards',
      'publications', 'push_deliveries', 'push_subscriptions', 'queue_events', 'queue_stage_log', 'quiz_answers', 'reflection_links', 'reflections', 'related_changes', 'related_groups', 'related_links', 'related_members', 'search_index', 'sessions', 'shows', 'variants', 'vocabulary_picks',
      'weekly_articles', 'weekly_links', 'weekly_listening', 'weekly_notes', 'weekly_publications',
    ]);
  });
});

describe('connexion et sessions', () => {
  it('sans session, les routes /api répondent 401', async () => {
    for (const path of ['/api/auth/session', '/api/auth/sessions', '/api/explorer', '/api/reflections']) {
      const res = await call(path);
      expect(res.status, path).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    }
  });

  it('une bonne phrase ouvre une session dans un cookie __Host- strict', async () => {
    const res = await call('/api/auth/login', { method: 'POST', body: { passphrase: PASSPHRASE } });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^__Host-discover_session=[A-Za-z0-9_-]{43};/);
    for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict']) expect(cookie).toContain(flag);

    const me = await call('/api/auth/session', { cookie: cookie.split(';')[0] });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ session: { current: true } });
  });

  it('le jeton brut n’est jamais stocké en base', async () => {
    const cookie = await login();
    const token = cookie.split('=')[1]!;
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?').bind(token).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('tolère les espaces autour de la phrase et les accents composés autrement (NFC)', async () => {
    const padded = await call('/api/auth/login', { method: 'POST', body: { passphrase: `  ${PASSPHRASE} ` } });
    expect(padded.status).toBe(200);
    const original = env.APP_PASSPHRASE;
    (env as { APP_PASSPHRASE: string }).APP_PASSPHRASE = 'phrase de café pour le téléphone';
    try {
      const nfd = 'phrase de café pour le téléphone'.normalize('NFD');
      expect((await call('/api/auth/login', { method: 'POST', body: { passphrase: nfd }, ip: '198.51.100.9' })).status).toBe(200);
    } finally {
      (env as { APP_PASSPHRASE: string }).APP_PASSPHRASE = original;
    }
  });

  it('une mauvaise phrase répond 401 sans cookie', async () => {
    const res = await call('/api/auth/login', { method: 'POST', body: { passphrase: 'mauvaise-phrase' } });
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('la déconnexion révoque la session à la requête suivante', async () => {
    const cookie = await login();
    expect((await call('/api/auth/logout', { method: 'POST', cookie, body: {} })).status).toBe(204);
    expect((await call('/api/auth/session', { cookie })).status).toBe(401);
  });

  it('on peut lister puis révoquer une session précise ou toutes les autres', async () => {
    const a = await login('198.51.100.1');
    const b = await login('198.51.100.2');
    const c = await login('198.51.100.3');
    const list = await (await call('/api/auth/sessions', { cookie: a })).json<{ sessions: { id: string; current: boolean }[] }>();
    expect(list.sessions).toHaveLength(3);
    const other = list.sessions.find((s) => !s.current)!;

    expect((await call(`/api/auth/sessions/${other.id}`, { method: 'DELETE', cookie: a })).status).toBe(204);
    const still = [await call('/api/auth/session', { cookie: b }), await call('/api/auth/session', { cookie: c })]
      .filter((r) => r.status === 200);
    expect(still).toHaveLength(1);

    expect((await call('/api/auth/sessions/revoke-others', { method: 'POST', cookie: a, body: {} })).status).toBe(200);
    expect((await call('/api/auth/session', { cookie: b })).status).toBe(401);
    expect((await call('/api/auth/session', { cookie: c })).status).toBe(401);
    expect((await call('/api/auth/session', { cookie: a })).status).toBe(200);
  });

  it('changer SESSION_EPOCH invalide toutes les sessions', async () => {
    const cookie = await login();
    const original = env.SESSION_EPOCH;
    (env as { SESSION_EPOCH: string }).SESSION_EPOCH = 'nouvelle-epoque';
    try {
      expect((await call('/api/auth/session', { cookie })).status).toBe(401);
    } finally {
      (env as { SESSION_EPOCH: string }).SESSION_EPOCH = original;
    }
  });

  it('une session expirée est refusée', async () => {
    const cookie = await login();
    await env.DB.prepare("UPDATE sessions SET idle_expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await call('/api/auth/session', { cookie })).status).toBe(401);
  });
});

describe('limitation des connexions', () => {
  it('6 échecs depuis une même IP en 15 min donnent 429, même avec la bonne phrase ensuite', async () => {
    const ip = '192.0.2.50';
    for (let i = 0; i < 5; i++) {
      const r = await call('/api/auth/login', { method: 'POST', body: { passphrase: 'faux' }, ip });
      expect(r.status).toBe(401);
    }
    const blocked = await call('/api/auth/login', { method: 'POST', body: { passphrase: PASSPHRASE }, ip });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    // une autre IP n'est pas bloquée
    expect((await call('/api/auth/login', { method: 'POST', body: { passphrase: PASSPHRASE }, ip: '192.0.2.51' })).status).toBe(200);
  });

  it('20 échecs dans l’heure, toutes IP confondues, bloquent la connexion globalement', async () => {
    for (let i = 0; i < 20; i++) {
      await call('/api/auth/login', { method: 'POST', body: { passphrase: 'faux' }, ip: `10.1.0.${i}` });
    }
    const res = await call('/api/auth/login', { method: 'POST', body: { passphrase: PASSPHRASE }, ip: '10.2.0.1' });
    expect(res.status).toBe(429);
  });
});

describe('CSRF', () => {
  it('refuse une écriture venant d’une autre origine', async () => {
    const cookie = await login();
    const res = await call('/api/auth/logout', { method: 'POST', cookie, body: {}, headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'csrf_origin' } });
    expect((await call('/api/auth/session', { cookie })).status).toBe(200);
  });

  it('refuse une écriture sans X-Discover-Client', async () => {
    const res = await call('/api/auth/login', {
      method: 'POST', body: { passphrase: PASSPHRASE }, pwa: false, headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'csrf_client' } });
  });

  it('refuse une écriture sans Origin ni Sec-Fetch-Site same-origin', async () => {
    const res = await call('/api/auth/login', {
      method: 'POST', body: { passphrase: PASSPHRASE }, pwa: false, headers: { 'X-Discover-Client': '1' },
    });
    expect(res.status).toBe(403);
  });

  it('refuse un corps qui n’est pas du JSON (formulaire)', async () => {
    const res = await call('/api/auth/login', {
      method: 'POST', body: 'passphrase=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(res.status).toBe(415);
  });

  it('refuse un JSON invalide ou trop gros', async () => {
    expect((await call('/api/auth/login', { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await call('/api/auth/login', { method: 'POST', body: { passphrase: 'x'.repeat(5000) } })).status).toBe(413);
  });
});

describe('Atelier', () => {
  it('/atelier/* exige le jeton Bearer et ignore les cookies', async () => {
    const cookie = await login();
    expect((await call('/atelier/ping', { cookie, pwa: false })).status).toBe(401);
    expect((await call('/atelier/ping', { pwa: false, headers: { Authorization: 'Bearer mauvais' } })).status).toBe(401);
    const ok = await call('/atelier/ping', { pwa: false, headers: { Authorization: `Bearer ${ATELIER_TOKEN}` } });
    expect(ok.status).toBe(200);
  });
});

describe('connexion désactivée (AUTH_DISABLED=true)', () => {
  const withOpenAccess = async (fn: () => Promise<void>) => {
    (env as { AUTH_DISABLED?: string }).AUTH_DISABLED = 'true';
    try {
      await fn();
    } finally {
      (env as { AUTH_DISABLED?: string }).AUTH_DISABLED = 'false';
    }
  };

  it('les données sont accessibles sans session, et la PWA est prévenue', async () => {
    await withOpenAccess(async () => {
      expect(await (await call('/api/auth/session')).json()).toEqual({ session: null, authDisabled: true });
      expect((await call('/api/shows')).status).toBe(200);
    });
  });

  it('les contrôles CSRF et le jeton de l’Atelier restent actifs', async () => {
    await withOpenAccess(async () => {
      const res = await call('/api/progress', { method: 'PUT', body: {}, headers: { Origin: 'https://evil.example' } });
      expect(res.status).toBe(403);
      expect((await call('/atelier/ping', { pwa: false })).status).toBe(401);
    });
  });
});

describe('en-têtes de sécurité', () => {
  it('chaque réponse de l’API porte CSP, nosniff, no-referrer et no-store', async () => {
    const res = await call('/api/auth/session');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
