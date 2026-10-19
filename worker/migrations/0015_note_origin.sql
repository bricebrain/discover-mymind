-- Notes « Article » (décision du 19 octobre 2026) : un texte collé ou partagé est attribué à sa publication,
-- jamais présenté comme une réflexion personnelle. Colonnes ajoutées : pas de reconstruction de la table
-- (les liens des notes, en cascade, restent intacts).
ALTER TABLE reflections ADD COLUMN origin TEXT NOT NULL DEFAULT 'personal' CHECK (origin IN ('personal','article'));
ALTER TABLE reflections ADD COLUMN source_name TEXT;
ALTER TABLE reflections ADD COLUMN source_url TEXT;
