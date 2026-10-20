-- Avancement des préparations : début, début de l'étape en cours, et journal des durées réelles par étape.
-- Le journal sert à estimer le temps restant (moyennes récentes par type de source et exécutant).
ALTER TABLE prepare_queue ADD COLUMN started_at TEXT;
ALTER TABLE prepare_queue ADD COLUMN stage_started_at TEXT;
CREATE TABLE queue_stage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id TEXT NOT NULL, kind TEXT NOT NULL, executor TEXT NOT NULL, stage TEXT NOT NULL,
  seconds REAL NOT NULL CHECK (seconds >= 0), ended_at TEXT NOT NULL
);
CREATE INDEX queue_stage_log_recent ON queue_stage_log(kind, executor, stage, id DESC);
-- Changement d'étape (Atelier sur le Mac ou cloud) : la durée de l'étape terminée est notée, la suivante démarre.
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
