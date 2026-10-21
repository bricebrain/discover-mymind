# Cache persistant de la bibliothèque

21 octobre 2026. Première étape de réduction des lectures D1 liées à la consultation de la PWA.

## Comportement

- La liste des contenus préparés, ses filtres et sa pagination, les détails consultés et les textes par publication sont sauvegardés dans IndexedDB.
- Les détails et listes sont considérés frais pendant cinq minutes. Naviguer ou rouvrir l'app pendant cette durée ne provoque pas une nouvelle lecture de ces données.
- Après cette durée, React Query peut revalider au montage, au retour au premier plan ou à la reconnexion. Les données locales peuvent être affichées pendant cette vérification. Il n'y a pas de polling supplémentaire.
- Les textes sont immuables par publication/version ; une nouvelle publication utilise une autre clé.
- Une préparation terminée invalide immédiatement la bibliothèque et les détails chargés. Les étapes intermédiaires ne les rechargent plus. Les événements d'anciens Workers, sans statut, conservent le comportement conservateur d'invalidation.
- Les changements manqués pendant une fermeture sont revérifiés selon la fraîcheur de cinq minutes ; ce lot n'ajoute pas de synchronisation différentielle serveur.

## Limites et nettoyage

- Base `discover-library-cache`, séparée des brouillons et des téléchargements ; aucun téléchargement audio automatique.
- Au plus 100 requêtes, environ 4 Mo de données sérialisées, 400 Ko par requête et sept jours depuis le dernier chargement serveur. Les dates ne sont pas renouvelées lors de la restauration.
- Sessions, jetons, notes, progressions et file de préparation exclus de cette sauvegarde.
- Une déconnexion, une révocation de la session courante ou un refus d'authentification purge ce cache et annule les lectures en vol. Les suppressions et invalidations de React Query sont répercutées dans la sauvegarde.
- Si IndexedDB est indisponible, l'app conserve son fonctionnement réseau. La restauration attend au plus une seconde et ignore les réponses tardives.
- Le cache ne remplace pas le mode téléchargements hors ligne, ni la base D1. Collecte et maintenance serveur restent indépendantes.

## Organisation

`pwa/src/cache/` isole la politique, le stockage, la validation des instantanés et la restauration/sauvegarde React Query. Aucun ajout de dépendance, aucun changement de schéma D1.

## Validation

Tests de réouverture sans nouvel appel réseau, conservation de la date de fraîcheur, pagination restaurée, revalidation après expiration/invalidation, exclusion des données sensibles, suppression, purge avec réponse en vol et stockage indisponible/bloqué. Tests des événements de publication et de reconnexion pour vérifier les appels évités et les actualisations nécessaires.

Résultats : 241 tests PWA et 10 tests Worker concernés réussis ; TypeScript Worker/PWA et compilation de production réussis.

Déployé le 21 octobre 2026 sur `https://discover.bricebrain.workers.dev`, version `c71cd00b-3e3f-49b0-ac0c-083cddb1bf72`. Contrôles de production : HTML identique à la compilation locale, lecture D1 et WebSocket Atelier authentifié avec ping/pong. La bibliothèque s'affiche dans le navigateur avec le nouveau bundle, sans erreur de console. La persistance/revalidation est couverte par les tests ; son impact sur le quota de production n'a pas encore été mesuré.
