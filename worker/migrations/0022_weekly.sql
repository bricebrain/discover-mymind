-- I8 : journal borné à la lecture, sans données de sécurité ni médias.
CREATE TABLE weekly_listening (
  week TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  listened_ms INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, target_type, target_id)
);
CREATE TABLE weekly_articles (
  week TEXT NOT NULL, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  was_read INTEGER NOT NULL DEFAULT 0, was_saved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, article_id)
);
CREATE INDEX idx_weekly_articles_article ON weekly_articles(article_id);
CREATE TABLE weekly_notes (
  note_id TEXT NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  changed_at TEXT NOT NULL, snapshot TEXT NOT NULL,
  PRIMARY KEY (note_id, changed_at)
);
CREATE INDEX idx_weekly_notes_date ON weekly_notes(changed_at, note_id);
-- Extraits historiques conservés : jamais le corps d'une révision postérieure à la semaine.
CREATE TRIGGER weekly_note_insert AFTER INSERT ON reflections WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT OR REPLACE INTO weekly_notes VALUES (NEW.id, NEW.updated_at,
    json_object('id',NEW.id,'title',NEW.title,'body',substr(NEW.body_md,1,2000),'kind',NEW.kind,
      'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'origin',NEW.origin,
      'sourceName',NEW.source_name,'sourceUrl',NEW.source_url));
END;
CREATE TRIGGER weekly_note_update AFTER UPDATE OF updated_at ON reflections
WHEN NEW.deleted_at IS NULL AND NEW.updated_at IS NOT OLD.updated_at
BEGIN
  INSERT OR REPLACE INTO weekly_notes VALUES (NEW.id, NEW.updated_at,
    json_object('id',NEW.id,'title',NEW.title,'body',substr(NEW.body_md,1,2000),'kind',NEW.kind,
      'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'origin',NEW.origin,
      'sourceName',NEW.source_name,'sourceUrl',NEW.source_url));
END;
INSERT INTO weekly_notes SELECT id,updated_at,
  json_object('id',id,'title',title,'body',substr(body_md,1,2000),'kind',kind,'createdAt',created_at,
    'updatedAt',updated_at,'origin',origin,'sourceName',source_name,'sourceUrl',source_url)
  FROM reflections WHERE deleted_at IS NULL;
CREATE TABLE weekly_publications (
  publication_id TEXT PRIMARY KEY, published_at TEXT NOT NULL, content_id TEXT NOT NULL,
  title TEXT NOT NULL, source_url TEXT
);
CREATE INDEX idx_weekly_publications_date ON weekly_publications(published_at, publication_id);
CREATE TRIGGER weekly_publication_ready AFTER UPDATE OF status ON publications
WHEN NEW.status='ready' AND OLD.status<>'ready'
BEGIN
  INSERT OR IGNORE INTO weekly_publications
    SELECT NEW.id,NEW.updated_at,c.id,c.title,c.source_url FROM contents c WHERE c.id=NEW.content_id;
END;
INSERT INTO weekly_publications SELECT p.id,p.updated_at,c.id,c.title,c.source_url
  FROM publications p JOIN contents c ON c.id=p.content_id WHERE p.status='ready';
CREATE TABLE weekly_links (
  reflection_id TEXT NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, variant_key TEXT NOT NULL, segment_id TEXT NOT NULL,
  quote TEXT, target_title TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (reflection_id, target_type, target_id, variant_key, segment_id, created_at)
);
CREATE INDEX idx_weekly_links_date ON weekly_links(created_at, reflection_id, target_type, target_id, variant_key, segment_id);
CREATE TRIGGER weekly_link_insert AFTER INSERT ON reflection_links
BEGIN
  INSERT OR REPLACE INTO weekly_links VALUES
    (NEW.reflection_id,NEW.target_type,NEW.target_id,NEW.variant_key,NEW.segment_id,NEW.quote,NEW.target_title,NEW.created_at);
END;
INSERT INTO weekly_links SELECT reflection_id,target_type,target_id,variant_key,segment_id,quote,target_title,created_at
  FROM reflection_links;
