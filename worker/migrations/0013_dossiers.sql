-- Les références enfant SET NULL sont conservées pendant l’élargissement du CHECK.
CREATE TABLE dossier_content_links AS SELECT id,content_id FROM episodes WHERE content_id IS NOT NULL;
CREATE TABLE dossier_note_links AS SELECT id,english_content_id FROM reflections WHERE english_content_id IS NOT NULL;
CREATE TABLE contents_next (
  id                     TEXT PRIMARY KEY,        -- donné par l'Atelier, ^[a-z0-9][a-z0-9-]{2,95}$
  title                  TEXT NOT NULL,
  original_language      TEXT NOT NULL,
  source_type            TEXT NOT NULL CHECK (source_type IN ('podcast','youtube','reflection','dossier')),
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
UPDATE episodes SET content_id=(SELECT content_id FROM dossier_content_links b WHERE b.id=episodes.id) WHERE id IN (SELECT id FROM dossier_content_links);
UPDATE reflections SET english_content_id=(SELECT english_content_id FROM dossier_note_links b WHERE b.id=reflections.id) WHERE id IN (SELECT id FROM dossier_note_links);
DROP TABLE dossier_content_links;
DROP TABLE dossier_note_links;
CREATE TABLE prepare_queue_next (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('episode','youtube','reflection','dossier')),
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
);

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

CREATE TABLE dossiers (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 sources_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE dossier_runs (
 id TEXT PRIMARY KEY, dossier_id TEXT NOT NULL REFERENCES dossiers(id), version INTEGER NOT NULL,
 title TEXT NOT NULL, sources_json TEXT NOT NULL, options_json TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(dossier_id,version,options_json)
);
CREATE INDEX idx_dossier_runs ON dossier_runs(dossier_id,created_at);
