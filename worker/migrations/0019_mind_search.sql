-- Jeton interne pour lier les écritures de liens au seul PATCH gagnant.
ALTER TABLE reflections ADD COLUMN mutation_token TEXT;

-- Index My Mind maintenu au niveau D1 : couvre aussi Articles et récupération Atelier.
-- Les autres types éventuels de search_index sont conservés.
DELETE FROM search_index WHERE kind='reflection';
INSERT INTO search_index(kind, ref_id, title, body)
  SELECT 'reflection', id, COALESCE(title,''), body_md FROM reflections WHERE deleted_at IS NULL;

CREATE TRIGGER reflections_search_insert AFTER INSERT ON reflections WHEN NEW.deleted_at IS NULL BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES ('reflection', NEW.id, COALESCE(NEW.title,''), NEW.body_md);
END;
CREATE TRIGGER reflections_search_update AFTER UPDATE OF title, body_md, deleted_at ON reflections BEGIN
  DELETE FROM search_index WHERE kind='reflection' AND ref_id=OLD.id;
  INSERT INTO search_index(kind, ref_id, title, body)
    SELECT 'reflection', NEW.id, COALESCE(NEW.title,''), NEW.body_md WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER reflections_search_delete AFTER DELETE ON reflections BEGIN
  DELETE FROM search_index WHERE kind='reflection' AND ref_id=OLD.id;
END;
CREATE INDEX reflections_mind_order ON reflections(deleted_at, updated_at DESC, id DESC);
