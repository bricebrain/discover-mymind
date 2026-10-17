// Génère migrations/0002_seed_shows.sql à partir de docs/seed-shows.json.
// Usage : node scripts/seed-shows-sql.mjs > migrations/0002_seed_shows.sql
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('../../docs/seed-shows.json', import.meta.url), 'utf8'));
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
// Échéances décalées d'une seconde : le cron les prend dans l'ordre de la liste.
const base = Date.parse('2026-10-17T00:00:00.000Z');
const rows = seed.shows.map((s, i) => {
  const at = new Date(base + i * 1000).toISOString();
  return `(${[s.id, s.title, s.publisher, s.appleId, s.feedUrl, s.language, s.category,
    s.titleFilter ? JSON.stringify(s.titleFilter) : null, s.autoPrepareLatest ? 1 : 0, at, at].map(q).join(', ')})`;
});
console.log(`-- Migration 0002 : émissions de départ (générée par scripts/seed-shows-sql.mjs, ${seed.shows.length} émissions).
INSERT OR IGNORE INTO shows
  (id, title, publisher, apple_id, feed_url, language, category, title_filter_json, auto_prepare, next_check_at, created_at)
VALUES
${rows.join(',\n')};`);
