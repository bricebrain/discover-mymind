CREATE TABLE vocabulary_picks (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL UNIQUE,
  word TEXT NOT NULL,
  sentence TEXT NOT NULL,
  contentId TEXT NOT NULL,
  publicationId TEXT NOT NULL,
  variantKey TEXT NOT NULL,
  segmentIndex INTEGER NOT NULL,
  language TEXT NOT NULL CHECK(language='en'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','already_known','failed')),
  wordId TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX vocabulary_picks_status ON vocabulary_picks(status,seq);
