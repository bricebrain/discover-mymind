-- Articles dans Explorer (décision du 19 octobre 2026) : The Guardian, The Conversation (US, France), ProPublica.
-- Tables séparées des émissions : aucune reconstruction de shows/episodes.
CREATE TABLE article_sources (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  publisher       TEXT NOT NULL,
  feed_url        TEXT NOT NULL,
  language        TEXT NOT NULL CHECK (language IN ('fr','en')),
  enabled         INTEGER NOT NULL DEFAULT 1,
  next_check_at   TEXT NOT NULL,
  last_success_at TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL
);
CREATE TABLE articles (
  id             TEXT PRIMARY KEY,                -- sha256(source|guid)[0..20]
  source_id      TEXT NOT NULL REFERENCES article_sources(id) ON DELETE CASCADE,
  guid           TEXT NOT NULL,
  url            TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT,
  author         TEXT,
  published_at   TEXT,
  content_text   TEXT,                            -- texte complet (flux) ou récupéré par l'Atelier
  content_status TEXT NOT NULL DEFAULT 'none' CHECK (content_status IN ('none','feed','pending','complete','partial','unavailable')),
  reflection_id  TEXT,                            -- note My Mind créée depuis l'article
  created_at     TEXT NOT NULL,
  UNIQUE (source_id, guid)
);
CREATE INDEX idx_articles_recent ON articles(published_at DESC, id);
INSERT INTO article_sources (id,title,publisher,feed_url,language,next_check_at,created_at) VALUES
  ('guardian-world','The Guardian · World','The Guardian','https://www.theguardian.com/world/rss','en','2026-01-01T00:00:00.000Z','2026-10-19T00:00:00.000Z'),
  ('conversation-us','The Conversation · US','The Conversation','https://theconversation.com/us/articles.atom','en','2026-01-01T00:00:00.000Z','2026-10-19T00:00:00.000Z'),
  ('conversation-fr','The Conversation · France','The Conversation','https://theconversation.com/fr/articles.atom','fr','2026-01-01T00:00:00.000Z','2026-10-19T00:00:00.000Z'),
  ('propublica','ProPublica','ProPublica','https://www.propublica.org/feeds/propublica/main','en','2026-01-01T00:00:00.000Z','2026-10-19T00:00:00.000Z');
