-- Quiz lié à la publication immuable, réponses personnelles (application mono-utilisateur).
ALTER TABLE variants ADD COLUMN quiz_json TEXT;
CREATE TABLE quiz_answers (
  publication_id TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  question_index INTEGER NOT NULL CHECK(question_index BETWEEN 0 AND 2),
  choice INTEGER NOT NULL CHECK(choice BETWEEN 0 AND 2),
  correct INTEGER NOT NULL CHECK(correct IN (0,1)),
  answered_at TEXT NOT NULL,
  PRIMARY KEY(publication_id, variant_key, question_index),
  FOREIGN KEY(publication_id,variant_key) REFERENCES variants(publication_id,variant_key) ON DELETE CASCADE
);
