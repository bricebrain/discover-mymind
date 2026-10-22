-- Réécoute progressive : 1, 3 puis 7 jours ; une programmation par contenu.
CREATE TABLE listening_reviews (
  content_id TEXT PRIMARY KEY REFERENCES contents(id),
  publication_id TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1 CHECK (step IN (1,2,3)),
  due_at TEXT NOT NULL,
  last_done_at TEXT,
  last_accuracy REAL CHECK (last_accuracy BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX listening_reviews_due ON listening_reviews(due_at);
