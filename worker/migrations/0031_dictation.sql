-- Dictée de l'original guidé : une ligne par phrase dictée, avec ce qui a été entendu et les erreurs analysées.
-- Sert à la mesure de progression (phrases comprises à l'oreille) et aux catégories d'erreurs les plus fréquentes.
CREATE TABLE dictation_attempts (
  id             TEXT PRIMARY KEY,
  content_id     TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  variant_key    TEXT NOT NULL,
  segment_id     TEXT NOT NULL,
  voice          TEXT NOT NULL CHECK (voice IN ('original','synthetic')),
  expected       TEXT NOT NULL,                 -- phrase de référence au moment de l'essai
  typed          TEXT NOT NULL,                 -- ce que l'apprenant a entendu et tapé
  expected_words INTEGER NOT NULL CHECK (expected_words >= 0),
  correct_words  INTEGER NOT NULL CHECK (correct_words >= 0 AND correct_words <= expected_words),
  errors_json    TEXT NOT NULL,                 -- [{expected, heard, category, explanation}]
  tip            TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX dictation_attempts_recent ON dictation_attempts(created_at DESC);
CREATE INDEX dictation_attempts_content ON dictation_attempts(content_id, variant_key, segment_id);
