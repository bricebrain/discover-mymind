ALTER TABLE variants ADD COLUMN coverage TEXT NOT NULL DEFAULT 'full' CHECK (coverage IN ('full','condensed','essentials'));
ALTER TABLE variants ADD COLUMN condensation_json TEXT;
ALTER TABLE publications ADD COLUMN lease_token TEXT;
ALTER TABLE publications ADD COLUMN commit_token TEXT;
-- Les garde-fous font échouer l'ensemble du batch D1 en cas de concurrence.
CREATE TABLE publication_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK (valid = 1));
-- Une clé réservée par le nettoyage ne peut être réutilisée avant sa suppression R2.
CREATE TABLE publication_gc (r2_key TEXT PRIMARY KEY);
CREATE TRIGGER publication_file_gc_guard BEFORE INSERT ON publication_files
WHEN EXISTS (SELECT 1 FROM publication_gc WHERE r2_key = NEW.r2_key)
BEGIN SELECT RAISE(ABORT, 'blob_deleting'); END;
