-- Cloud manuel : l'ancien Atelier ne prend jamais ces demandes.
ALTER TABLE prepare_queue ADD COLUMN executor TEXT NOT NULL DEFAULT 'mac' CHECK (executor IN ('mac','cloud'));
CREATE TABLE cloud_quotes (
  id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, month TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE cloud_runs (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL UNIQUE, month TEXT NOT NULL,
  snapshot_json TEXT NOT NULL, lease_token TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL CHECK(reserved_micros>=0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','running','done','failed')),
  error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, purged_at TEXT
);
CREATE INDEX cloud_runs_month ON cloud_runs(month);
-- Aucune cascade depuis la file : retirer un élément ne doit pas effacer une dépense.
CREATE TABLE cloud_operations (
  run_id TEXT NOT NULL REFERENCES cloud_runs(id), operation TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('sent','complete')),
  result_key TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(run_id,operation)
);
CREATE TABLE cloud_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
