-- I7 : un retour par version publiée ; ordre initial conservé lors des corrections.
CREATE TABLE level_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('A2','B1','B2','C1','original')),
  rating TEXT NOT NULL CHECK (rating IN ('too_easy','just_right','too_hard')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (publication_id, variant_key)
);
CREATE INDEX idx_level_feedback_show_recent ON level_feedback(show_id, id DESC);
