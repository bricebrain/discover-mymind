# Réduction des lectures D1 par événements

20 octobre 2026. Modifications coordonnées de Discover et de l’Atelier (`../convert`).

- La PWA actualise les préparations et les dossiers sur `queue.changed`. Elle ne les interroge plus toutes les 15/20 secondes lorsque le WebSocket est connecté. Sans connexion, secours toutes les cinq minutes ; récupération immédiate à la reconnexion et au retour au premier plan.
- `/atelier/events` utilise le Bearer existant côté Python uniquement. Le Worker construit l’identité interne, dont la validité est bornée à une heure et liée au jeton Atelier. Les connexions du Mac ne masquent pas les notifications push du téléphone.
- Le moteur du Mac se réveille sur connexion, reconnexion ou événement. Au repos, vérification de secours toutes les cinq minutes. Les renouvellements de bail pendant le traitement restent inchangés.
- Les demandes de récupération de texte et les nouveaux mots réveillent aussi le moteur. Les actions de relecture locales sont détectées sans appel distant.
- L’écran Atelier consulte un cache local partagé : les consultations toutes les quatre secondes ne relisent plus D1 en l’absence de changement. Les événements et mutations locales invalident le cache ; expiration après cinq minutes. Le cache ne stocke pas de jetons de bail.
- La présence du Mac est transmise par `atelier.seen`, sans relecture de la file ni réinitialisation du décompte local des durées.

La collecte automatique et le cron de maintenance restent inchangés. Aucune migration D1.

## Validation

- Worker : 25 tests (événements, canal Atelier, file, progression, dossiers).
- PWA : 8 tests (connexion, présence et absence de polling connecté), compilation de production.
- Atelier : 47 tests (cache/événements, file, HTTP, workflow, synchronisation vocabulaire).
- Connexion réelle du client Python au Worker local : handshake authentifié, réception de `connected`, ping/pong et réveil du moteur.
- Test du cache : 900 consultations locales successives sans changement donnent un seul appel distant.

## Mise en service

Déployer ensemble le Worker et la PWA, puis redémarrer l’Atelier pour charger le nouveau consommateur. Le client WebSocket est déclaré dans les dépendances Python de l’Atelier et installé dans le Python de son lanceur. Les tests utilisent les ressources locales, pas la base de production.

Déploiement effectué le 21 octobre 2026 sur `https://discover.bricebrain.workers.dev`, version `436263cb-f40b-4475-89f8-b44836a70bf8`. Vérifications de production réussies : HTML identique à la compilation locale, lecture authentifiée de la file via D1, connexion WebSocket Atelier et ping/pong. Le processus Atelier local doit être redémarré pour charger le nouveau consommateur.
