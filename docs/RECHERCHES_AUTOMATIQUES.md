# Recherches Discover

Veille Gemini quotidienne, rédaction plafonnée à trois créneaux sur sept jours glissants,
six brouillons en attente au maximum. Les cinq axes sont IA, recherches scientifiques expliquées,
capacités humaines étayées par la recherche, économie des entreprises (fusions/acquisitions incluses)
et grands projets d'avenir. Les thèmes alternent selon les dernières veilles.

## Fonctionnement

- Le cron existant réserve au plus une veille par jour UTC, après 6 h UTC. Un déclenchement manuel
  rejoint la même réservation ; il ne crée pas un second appel pour la journée.
- Le Workflow `ResearchPreparation` recherche avec Google Search via Gemini, récupère les pages publiques
  réellement citées, puis rédige et contrôle le texte contre ces pages. Les contenus externes restent des données.
- Trois documents accessibles de deux hôtes distincts sont nécessaires. Le contrôle demande également une source
  de première main et des organismes indépendants ; ces appréciations sémantiques restent celles d'une IA.
  Les PDF seuls et les pages protégées/inaccessibles sont écartés dans cette première version.
- Les sujets des 90 derniers jours, y compris les brouillons écartés, alimentent l'anti-répétition.
  Une comparaison de titre/clé de sujet complète les consignes sémantiques au rédacteur et au contrôleur.
- Les articles et brouillons sont visibles dans `/research`, accessible depuis Explorer et Réglages. Un réglage permet
  la publication automatique après verdict documentaire favorable (`ok`), sans validation humaine. Les verdicts `review`
  et `rejected`, ainsi que les sujets écartés, ne sont jamais publiés automatiquement.
- L'activation publie aussi les brouillons existants au contrôle favorable, par lots de trois. Le Workflow publie après
  le contrôle ; le cron reprend les publications interrompues sans rappeler Gemini. La désactivation rétablit la validation
  manuelle des prochains articles. Le réglage est séparé de l'interrupteur de veille.
- Après publication, l'article entre dans Explorer avec ses sources et l'attribution de recherche Google.
  Sa conversion en note, en audio anglais et en quiz utilise les actions et la file Atelier existantes.
- Les articles Discover sont conservés au-delà des 24 heures de rétention des flux d'actualité.

## Exploitation

Migration : `0033_research.sql`. Binding Workflow `RESEARCH`, secret existant `GEMINI_API_KEY`.
Modèle identique à celui des préparations cloud : `gemini-3.1-flash-lite`.
La veille et la publication automatique sont désactivées par défaut ; leurs interrupteurs sont dans `/research`.
Le réglage `research_auto_publish` est enregistré dans `app_settings`. L'origine de publication est capturée côté serveur
à l'activation dans `research_publication_origin`, pour construire les liens des articles préparés hors requête HTTP.

Chaque veille réserve 0,25 USD dans un registre mensuel plafonné à 10 USD de réservations.
Il s'agit d'une borne sur les tentatives, pas d'une garantie sur la facture Google, qui dépend notamment
du nombre de requêtes de recherche. Au plus un appel de recherche, un de rédaction et un de contrôle par veille.
Une journée sans créneau de rédaction ne fait que la veille. Les réservations restent comptées après échec.
Les audios et quiz éventuels utilisent le mécanisme et les budgets de préparation existants.

Les marqueurs en base précèdent les appels. Les résultats sont sauvegardés dans R2 et réutilisés.
Une interruption ambiguë ne provoque jamais un nouvel appel payé automatique. Les copies de travail
R2 expirent après 30 jours ; les sujets, les brouillons et le registre restent conservés.

## Remise à zéro des publications

L'endpoint `POST /atelier/maintenance/reset-publications` est réservé au jeton Atelier.
Corps : `before` (ISO UTC complet) et `dryRun: true` pour examiner les volumes sans mutation.
Pour exécuter : même date et `confirm: "RESET_PUBLICATIONS_KEEP_NOTES"`.
Répéter le même appel jusqu'à ce que `contents`, `articles`, `episodes`, `files`, `manifests` et `cloudCopies`
soient à zéro. Petits lots reprenables ; annulation des anciens baux avant suppression.

Les publications antérieures à la coupure sont détachées via la suppression habituelle, leurs quiz/progressions
effacés et leurs fichiers inaccessibles supprimés via le ramasse-miettes existant. Les copies cloud sont purgées,
sans effacer le registre financier. Les notes personnelles et leurs textes, abonnements, réglages et mots gardés
restent conservés ; les liens vers les contenus supprimés sont détachés.

Le marqueur `content_reset_at` empêche la réimportation et la préparation automatique des anciens éléments.
Les téléchargements hors ligne et leurs progressions sont purgés à la prochaine connexion de chaque appareil,
dans la base dédiée aux téléchargements, sans toucher à My Mind ni aux préférences.

## Validation

Tests Worker : vrai Workflow avec fournisseurs simulés, absence de double envoi, provenance, validation,
authentification/CSRF, quotas, publication concurrente, rétention et remise à zéro avec préservation des notes.
Tests PWA : états vide/erreur, publication bloquée, invalidation des téléchargements.

## Mise à jour de la PWA

La PWA vérifie le service worker au démarrage, au retour au premier plan, au retour du réseau et toutes les cinq
minutes lorsqu'elle est visible. Les vérifications automatiques sont espacées d'au moins une minute et ne sont
pas lancées hors ligne. L'activation d'une nouvelle version utilise le rechargement automatique déjà fourni par
`vite-plugin-pwa`. Réglages propose également « Rechercher une mise à jour ».

Une installation qui utilisait l'ancien mécanisme doit être fermée complètement puis rouverte une première fois
pour recevoir cette amélioration. Il ne faut pas effacer les données du navigateur ni réinstaller Discover pour cela :
les notes et téléchargements sont conservés lors des mises à jour de l'interface.

Références :
- https://ai.google.dev/gemini-api/docs/google-search
- https://developers.cloudflare.com/workflows/build/rules-of-workflows/

## Articles anglais et audio dans Explorer

Chaque publication Gemini crée automatiquement une demande Atelier liée à l’article. Elle utilise
l’original guidé : traduction intégrale en anglais naturel, lecture anglaise par Kokoro, transcription
synchronisée, explications françaises, quiz et dictée. Les références restent dans l’article français ;
les URL et marqueurs de citations ne sont pas lus. Le choix Kokoro est limité à ces recherches et ne
modifie pas les réglages audio des autres contenus. L’Atelier Mac doit être démarré pour produire cette voix locale.

L’article reste dans le fil Explorer ; son lecteur habituel apparaît sur cette même fiche après publication
de l’audio. La progression de préparation est affichée dans le fil et le détail. La page Recherches sert
au suivi de la veille. Les articles déjà publiés sont rattrapés sans régénérer leur recherche. Une demande
annulée ou échouée n’est jamais recréée automatiquement ; l’interrupteur général des préparations reste respecté.
