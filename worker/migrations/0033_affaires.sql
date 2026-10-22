-- Élargit les sources à une seule affaire à la demande et autorise quatre choix de verdict.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE affaire_episode_links AS SELECT id,content_id FROM episodes WHERE content_id IS NOT NULL;

CREATE TABLE affaire_note_links AS SELECT id,english_content_id FROM reflections WHERE english_content_id IS NOT NULL;

DROP TRIGGER weekly_publication_ready;

CREATE TABLE contents_next (
  id                     TEXT PRIMARY KEY,        -- donné par l'Atelier, ^[a-z0-9][a-z0-9-]{2,95}$
  title                  TEXT NOT NULL,
  original_language      TEXT NOT NULL,
  source_type            TEXT NOT NULL CHECK (source_type IN ('podcast','youtube','reflection','dossier','affaire')),
  source_ref             TEXT,                    -- 'episode:<id>' | 'reflection:<id>' | NULL
  source_url             TEXT,
  category               TEXT,
  editorial              TEXT NOT NULL DEFAULT 'news' CHECK (editorial IN ('news','discovery')),
  current_publication_id TEXT REFERENCES publications(id),  -- NULL = rien de visible
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  deleted_at             TEXT
);

INSERT INTO contents_next SELECT * FROM contents;

DROP TABLE contents;

ALTER TABLE contents_next RENAME TO contents;

CREATE TRIGGER weekly_publication_ready AFTER UPDATE OF status ON publications
WHEN NEW.status='ready' AND OLD.status<>'ready'
BEGIN
  INSERT OR IGNORE INTO weekly_publications
    SELECT NEW.id,NEW.updated_at,c.id,c.title,c.source_url FROM contents c WHERE c.id=NEW.content_id;
END;

CREATE TABLE prepare_queue_next (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('episode','youtube','reflection','dossier','affaire')),
  ref              TEXT NOT NULL,                 -- episode_id, URL YouTube validée ou reflection_id
  options_json     TEXT NOT NULL,                 -- § 7.4
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','leased','done','failed','cancelled')),
  lease_token      TEXT,                          -- jeton de bail (exigé pour toute mise à jour)
  lease_owner      TEXT,                          -- identifiant de l'instance Atelier
  lease_expires_at TEXT,
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  stage            TEXT,                          -- download | transcribe | translate | adapt | tts | publish
  content_id       TEXT,
  error            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
, executor TEXT NOT NULL DEFAULT 'mac' CHECK (executor IN ('mac','cloud')), started_at TEXT, stage_started_at TEXT);

INSERT INTO prepare_queue_next SELECT * FROM prepare_queue;

DROP TABLE prepare_queue;

ALTER TABLE prepare_queue_next RENAME TO prepare_queue;

CREATE UNIQUE INDEX idx_queue_active ON prepare_queue(kind,ref) WHERE status IN ('pending','leased');

CREATE INDEX idx_queue_claim ON prepare_queue(status,lease_expires_at,created_at);

CREATE TRIGGER queue_event_insert AFTER INSERT ON prepare_queue BEGIN
  INSERT INTO queue_events(queue_id,status,stage) VALUES(NEW.id,NEW.status,NEW.stage);
END;

CREATE TRIGGER queue_event_update AFTER UPDATE ON prepare_queue
WHEN NEW.status IS NOT OLD.status OR NEW.stage IS NOT OLD.stage BEGIN
  INSERT INTO queue_events(queue_id,status,stage,notification) VALUES(NEW.id,NEW.status,NEW.stage,
    CASE WHEN NEW.status='done' THEN 'ready' WHEN NEW.status='failed' THEN 'failed'
      WHEN NEW.status='pending' AND NEW.stage='review' THEN 'review' ELSE NULL END);
END;

CREATE TRIGGER queue_stage_change AFTER UPDATE OF stage ON prepare_queue
WHEN NEW.stage IS NOT OLD.stage
BEGIN
  INSERT INTO queue_stage_log (queue_id, kind, executor, stage, seconds, ended_at)
    SELECT NEW.id, NEW.kind, NEW.executor, OLD.stage,
      MAX(0, (julianday(NEW.updated_at) - julianday(OLD.stage_started_at)) * 86400), NEW.updated_at
    WHERE OLD.stage IS NOT NULL AND OLD.stage_started_at IS NOT NULL AND OLD.status = 'leased'
      AND OLD.stage NOT IN ('source_ready', 'review');
  UPDATE prepare_queue SET stage_started_at = NEW.updated_at,
    started_at = CASE WHEN NEW.status = 'leased' THEN COALESCE(started_at, NEW.updated_at) ELSE started_at END
  WHERE id = NEW.id;
END;

CREATE TABLE quiz_answers_next (
  publication_id TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  question_index INTEGER NOT NULL CHECK(question_index BETWEEN 0 AND 2),
  choice INTEGER NOT NULL CHECK(choice BETWEEN 0 AND 3),
  correct INTEGER NOT NULL CHECK(correct IN (0,1)),
  answered_at TEXT NOT NULL,
  PRIMARY KEY(publication_id, variant_key, question_index),
  FOREIGN KEY(publication_id,variant_key) REFERENCES variants(publication_id,variant_key) ON DELETE CASCADE
);

INSERT INTO quiz_answers_next SELECT * FROM quiz_answers;

DROP TABLE quiz_answers;

ALTER TABLE quiz_answers_next RENAME TO quiz_answers;

UPDATE episodes SET content_id=(SELECT content_id FROM affaire_episode_links b WHERE b.id=episodes.id) WHERE id IN (SELECT id FROM affaire_episode_links);

UPDATE reflections SET english_content_id=(SELECT english_content_id FROM affaire_note_links b WHERE b.id=reflections.id) WHERE id IN (SELECT id FROM affaire_note_links);

DROP TABLE affaire_episode_links;

DROP TABLE affaire_note_links;

PRAGMA defer_foreign_keys = OFF;
