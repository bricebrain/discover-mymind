-- Suppression des podcasts (demandée le 21 octobre 2026) : contenus publiés, épisodes et émissions.
-- DESTRUCTIF : sauvegarde D1 et accord explicite exigés avant l'application en production.
-- Le 21 octobre 2026, 4 contenus sont concernés (podcast-f3bd04144a32901129c8, podcast-dc059047ac4edae0402c,
-- podcast-85a51df8a790bfe4f3fd, podcast-25fb902f02208959dd63), 49 émissions et 434 épisodes.

-- 1. Contenus : mêmes effets que DELETE /api/contents/:id (routes/contents.ts, remove).
--    Les publications passent « superseded » au 1er janvier 1970 : le nettoyage horaire (cleanupPublications)
--    supprime ensuite de R2 les fichiers que plus aucune publication vivante ne référence, puis les manifestes.
--    Les lignes de contenus restent (suppression logique, comme dans l'application) : la sous-requête reste valable.
UPDATE contents SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), current_publication_id = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%') AND deleted_at IS NULL;
UPDATE publications SET
  status = CASE WHEN status IN ('uploading','committing') THEN 'abandoned' WHEN status = 'ready' THEN 'superseded' ELSE status END,
  superseded_at = CASE WHEN status IN ('ready','superseded') THEN '1970-01-01T00:00:00.000Z' ELSE superseded_at END,
  revision = revision || ':deleted:' || strftime('%Y-%m-%dT%H:%M:%fZ','now'), commit_token = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE content_id IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%') AND revision NOT LIKE '%:deleted:%';
UPDATE episodes SET content_id = NULL WHERE content_id IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%');
UPDATE reflections SET english_content_id = NULL WHERE english_content_id IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%');
DELETE FROM quiz_answers WHERE publication_id IN
  (SELECT id FROM publications WHERE content_id IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%'));
DELETE FROM listening_progress WHERE target_type = 'variant'
  AND substr(target_id, 1, instr(target_id, ':') - 1) IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%');
DELETE FROM reflection_links WHERE target_type = 'content' AND target_id IN (SELECT id FROM contents WHERE source_type = 'podcast' OR source_ref LIKE 'episode:%');

-- 2. Transcriptions de flux mises en cache dans R2 (routes/transcripts.ts) : confiées au même nettoyage horaire.
INSERT OR IGNORE INTO publication_gc (r2_key)
  SELECT 'transcripts/' || e.id || '.' || e.transcript_type FROM episodes e JOIN shows s ON s.id = e.show_id
  WHERE s.source_type = 'podcast' AND e.transcript_type IN ('srt','vtt');

-- 3. Épisodes, progression, demandes de préparation et émissions podcast.
--    Les déclencheurs related_episodes_delete retirent les épisodes des groupes « même sujet ».
DELETE FROM listening_progress WHERE target_type = 'episode'
  AND target_id IN (SELECT e.id FROM episodes e JOIN shows s ON s.id = e.show_id WHERE s.source_type = 'podcast');
DELETE FROM prepare_queue WHERE kind = 'episode';
DELETE FROM episodes WHERE show_id IN (SELECT id FROM shows WHERE source_type = 'podcast');
DELETE FROM level_feedback WHERE show_id IN (SELECT id FROM shows WHERE source_type = 'podcast');
DELETE FROM shows WHERE source_type = 'podcast';
