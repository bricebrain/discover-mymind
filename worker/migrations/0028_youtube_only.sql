-- Discover suit seulement YouTube (décision du 21 octobre 2026) : seules 8 émissions podcast sur 38
-- publiaient une transcription, alors que presque toutes les vidéos ont des sous-titres automatiques.
-- Les émissions podcast sont désactivées (réversible) : le cron ne les collecte plus et l'API ne les montre plus.
-- Leur suppression, avec les contenus déjà publiés, fait l'objet de la migration suivante.
UPDATE shows SET enabled = 0, auto_prepare = 0, last_error = NULL WHERE source_type = 'podcast';
-- Demandes de préparation de podcast encore en attente : annulées (aucune ne l'est en production le 21 octobre 2026).
UPDATE prepare_queue SET status = 'cancelled', lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL, stage = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE kind = 'episode' AND status IN ('pending','leased');
