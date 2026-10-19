-- Récupération du texte d'un article depuis son lien (par l'Atelier sur le Mac).
-- État : pending (demandée) → complete | partial (paywall, texte tronqué) | unavailable | skipped (note déjà remplie).
ALTER TABLE reflections ADD COLUMN article_fetch TEXT CHECK (article_fetch IN ('pending','complete','partial','unavailable','skipped'));
ALTER TABLE reflections ADD COLUMN article_fetch_at TEXT;
