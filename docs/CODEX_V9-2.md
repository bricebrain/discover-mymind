# V9-2 — Intégration dans les écrans Discover

19 octobre 2026. Branche `codex/v9-2`, worktree `/private/tmp/discover-mymind-codex-v9-2`,
base `35cf35f` (`codex/v9-1`). Ce lot inclut donc les composants V9-1, sans fusion dans `main`.

## Livraison

- `content/VersionLearning.tsx`, raccordé dans `components/PreparedEpisode.tsx` et `pages/ContentPage.tsx` : quiz puis retour
  de niveau sous la transcription anglaise. Publication explicite, index du passage converti de millisecondes en secondes ;
  la réécoute exige un audio et une synchronisation vérifiée. Le cache de transcription est partagé avec le lecteur.
- `content/VariantTranscript.tsx`, `content/usePassageActions.ts`, `listening/OriginalAccess.tsx` : volet commun « Ce passage »
  pour lire/écouter l'original et garder un mot. Sélection de texte dans un seul passage anglais, menu contextuel/appui long
  ou bouton accessible de 44 px ; la sélection préremplit le mot, sinon le champ reste à renseigner. Le volet reçoit le texte
  exact, l'index, le contenu, la publication et la version. Français, horodatages et contrôles sont exclus de la sélection.
  L'ancien `OriginalButton`, désormais sans appelant, est remplacé par le bouton commun et supprimé.
- `RelatedList` en bas d’`EpisodeDetail`, d’`ArticleDetail`, et de `NoteEditor` sous la préparation anglaise, pour les notes
  déjà synchronisées. Liens internes mis au style du kit (sans soulignement natif bleu).
- `related/useExplorerEvents.ts` et `related/eventFeed.ts`, raccordés dans `explorer/ExplorerFeed.tsx` : candidats des sept
  derniers jours, un par journée présente dans le fil (date de mise à jour du groupe). Masquage conservé localement, borné
  aux 200 derniers groupes ; repli en mémoire si le stockage échoue. Groupes de deux à six membres seulement.
  « Préparer un condensé » crée le dossier avec les références article/épisode intactes puis ouvre `DossierPrepareDialog`.
  Aucune demande de préparation n'est envoyée avant la validation du volet.
- `selection/SelectionScope.tsx` autour du Shell : cartes Explorer et épisodes sauvegardés via `FeedCards`, contenus préparés
  via `PreparedContents`. L'appui long fonctionne sur le bouton principal de la carte ; lecture/suppression restent des
  commandes distinctes hors sélection. L'affordance clavier apparaît au focus ; elle n'intercepte pas le toucher normal
  sur une vignette. Le mode actif affiche les coches, intercepte la navigation des cartes et permet de créer un dossier.
  Changer de fil/écran vide la sélection ; Retour/Annuler ferment le mode sur place. La barre et son erreur sont rendues
  dans un portail, au-dessus de la navigation et de `--player-h`, indépendamment des transformations Motion des écrans.
- `pages/WordPicksPage.tsx`, route `/vocabulary`, entrée dans `SettingsPage`, titre « Mots gardés » dans le Shell : liste,
  statuts, pagination et suppression du composant V9-1, avec rappel de la portée de la suppression.

Pas de bibliothèque ajoutée. Tous les fichiers de production ajoutés restent courts ; `NoteEditor` reste sous 300 lignes.

## Ajout API rétrocompatible

`worker/src/routes/contents.ts` ajoute au GET `/api/contents/:id` :

```json
{"episode":{"id":"identifiant-épisode","showId":"identifiant-émission"}}
```

La valeur est `null` sans épisode associé. Le rapprochement reprend les critères du retour de niveau existant :
`sourceType=podcast` / `sourceRef=episode:<id>` ou `sourceType=youtube` / `sourceRef=youtube:<video_id>`.
Le manifeste, les variantes et les protections de visibilité restent inchangés. La PWA reçoit ce champ optionnel dans
`api/contents.ts`. Dans le détail d'épisode, `showId` est aussi transmis directement depuis les métadonnées déjà chargées.

Une vidéo ajoutée sans chaîne suivie ne reçoit pas d'émission inventée. L'ancien Worker reste lisible : le retour de niveau
depuis `ContentPage` apparaît lorsque le nouveau champ est disponible ; les détails d'épisode ont déjà leur `showId`.
Aucune migration. Petit SELECT lié et borné ; aucune nouvelle écriture ni requête externe dans cette route.
Vérification du contrat `bind`/`first` : [documentation D1](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).
Skill appliquée : `/Users/brice/.codex/skills/workers-best-practices/SKILL.md`.

## Vérifications

| Projet | Résultat |
| --- | --- |
| Discover PWA | `npm test` : **190 tests / 36 fichiers** ; `npx tsc --noEmit -p .` et `npm run build` verts |
| Discover Worker | `npm test` : **345 tests / 31 fichiers** ; `npx tsc --noEmit -p .` vert |
| Atelier | `python3 -m unittest discover -s tests -q` : **267 tests**, verts |
| EnglishFluency Worker | `npm test` : **223 tests / 17 fichiers**, verts |
| EnglishPWA | `npx tsc -b && npm test -- --run && npm run lint && npm run build` : **90 tests / 15 fichiers**, tout vert |

Tests ajoutés : association podcast/vidéo/absence d'émission dans D1 ; branchement quiz/horodatages/publication ; volet commun
original et vocabulaire ; sélection anglaise isolée et préremplissage ; classement et masquage des événements ; création de
dossier sans préparation implicite ; appui long sur le bouton réel d'une carte Explorer ; sélection de contenu en Bibliothèque.
Les tests V9-1 et les autres suites restent exécutés intégralement.

Recette navigateur locale sur **API de production en lecture**, dans des cadres de **375 et 720 px** :

- carte d'événement réelle dans Explorer, liens vers les sources ;
- appui long sur un article, ajout d'un épisode, barre active à deux sources ; Retour ferme le mode sans quitter Explorer ;
- Bibliothèque et détail préparé côte à côte à 720 px ; retour de niveau et rapprochements présents ;
- volet commun d'un passage anglais : accès à l'original, ouverture du vocabulaire et expression modifiable valide ;
- lien Réglages → Mots gardés et écran dédié.

Le proxy temporaire refuse toutes les écritures `/api` **avant** transmission au serveur. Aucun enregistrement de mot,
retour de niveau, dossier, progression ou préparation n'a été fait en production. Les créations et envois sont testés avec
doubles réseau. Le contenu préparé consulté ne contenait pas de quiz : le GET vide est masqué comme attendu, et les quiz
restent couverts par fixtures/tests. Le nouveau champ API n'est vérifié qu'en D1 local, sans déploiement.

Un Service Worker local a intercepté le cadre de recette après navigation ; la suite s'est faite sur une origine locale
propre (port 4175) avec l'enregistrement du SW bloqué pour cette recette. Le fichier `vite.preview-prod.config.ts`, les cadres
et les serveurs temporaires sont retirés après contrôle. Le hors ligne et les gestes Android physiques restent à valider
sur Fold7, conformément au brief. Captures locales : `/private/tmp/discover-v9-2-selection-375.png`,
`/private/tmp/discover-v9-2-word-720.png`, `/private/tmp/discover-v9-2-explorer-720.png`.

Avertissements préexistants non bloquants : bundle Discover > 500 kB, audio lu comme texte dans un test Worker, faux HTTPError
Python et SQLite expérimental. Aucun appel IA payant, déploiement ou migration en production. Aucun fichier de l'Atelier modifié.

## Suite

V9-2 prêt pour revue sur sa branche. Avant un éventuel déploiement, demander l'accord explicite pour ce lot ; aucune migration
n'est nécessaire. Prochain chantier : V9-3, synchronisation automatique du vocabulaire dans l'Atelier.
