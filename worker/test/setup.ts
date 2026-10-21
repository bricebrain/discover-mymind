import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }).TEST_MIGRATIONS);

// Les émissions de départ étaient des podcasts, supprimés par la migration 0029 : une chaîne YouTube les remplace
// pour les tests qui rattachent un épisode à « une émission quelconque ».
await env.DB.prepare(`INSERT OR IGNORE INTO shows (id,title,feed_url,language,category,next_check_at,created_at,source_type)
  VALUES ('chaine-test','Chaîne de test','https://feeds.example.com/chaine-test.xml','en','news','2026-10-17','2026-10-17','youtube')`).run();
