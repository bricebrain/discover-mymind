-- Retrait demandé le 2026-10-18 : arrêter la collecte sans effacer l’historique.
UPDATE shows SET enabled=0 WHERE id='lheure-du-monde';
