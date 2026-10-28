-- Veille personnelle : les propositions restent privées au fil jusqu'à leur validation.
CREATE TABLE research_runs (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','running','drafted','skipped','failed')),
  draft_slot INTEGER NOT NULL DEFAULT 0,
  reserved_micros INTEGER NOT NULL,
  error TEXT,
  purged_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE research_operations (
  run_id TEXT NOT NULL REFERENCES research_runs(id),
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('started','done')),
  PRIMARY KEY(run_id,name)
);
CREATE TABLE research_drafts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES research_runs(id),
  topic_key TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  article_json TEXT NOT NULL,
  review_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_research_history ON research_drafts(created_at DESC);
INSERT OR IGNORE INTO app_settings(key,value) VALUES ('research_enabled','0');
-- Ce n'est pas un flux RSS : la date l'exclut de la collecte, la source reste visible dans Explorer.
INSERT INTO article_sources(id,title,publisher,feed_url,language,next_check_at,created_at)
VALUES ('discover-research','Discover · Recherches','Discover · Recherches','','fr','9999-01-01','2026-10-27');
