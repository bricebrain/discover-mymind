-- Préparation automatique réglable par émission (décision du 19 octobre 2026) :
-- L'essentiel 4 min (défaut) ou Condensé 8 min, niveau choisi ; interrupteur général pour tout couper.
ALTER TABLE shows ADD COLUMN auto_preset TEXT NOT NULL DEFAULT 'essentials4' CHECK (auto_preset IN ('essentials4','condensed8'));
ALTER TABLE shows ADD COLUMN auto_level TEXT NOT NULL DEFAULT 'B1' CHECK (auto_level IN ('A2','B1','B2','C1','original'));
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO app_settings (key,value) VALUES ('auto_prepare_enabled','1');
