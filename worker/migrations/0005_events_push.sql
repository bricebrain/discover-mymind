-- Outbox transactionnelle : aucune transition n'est annoncée avant son commit D1.
CREATE TABLE queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  notification TEXT CHECK(notification IN ('ready','review','failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  dispatched_at TEXT
);
CREATE INDEX idx_events_queue ON queue_events(queue_id,id);
CREATE INDEX idx_events_pending ON queue_events(dispatched_at,id);
CREATE TRIGGER queue_event_insert AFTER INSERT ON prepare_queue BEGIN
  INSERT INTO queue_events(queue_id,status,stage) VALUES(NEW.id,NEW.status,NEW.stage);
END;
CREATE TRIGGER queue_event_update AFTER UPDATE ON prepare_queue
WHEN NEW.status IS NOT OLD.status OR NEW.stage IS NOT OLD.stage BEGIN
  INSERT INTO queue_events(queue_id,status,stage,notification) VALUES(NEW.id,NEW.status,NEW.stage,
    CASE WHEN NEW.status='done' THEN 'ready' WHEN NEW.status='failed' THEN 'failed'
      WHEN NEW.status='pending' AND NEW.stage='review' THEN 'review' ELSE NULL END);
END;
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  session_id TEXT,
  epoch TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_test_at TEXT
);
CREATE TABLE push_deliveries (
  event_id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('ready','review','failed','test')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  finished_at INTEGER,
  PRIMARY KEY(event_id,device_id)
);
CREATE INDEX idx_push_due ON push_deliveries(finished_at,next_at);
