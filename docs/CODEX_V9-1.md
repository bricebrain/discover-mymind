# V9-1 — Composants Discover

Livraison du 19 octobre 2026, à partir de `main` (`ca56988`).
Branche `codex/v9-1`, worktree `/private/tmp/discover-mymind-codex-v9-1`.
Les briefs V9, V8 (K8/A8) et V2 ont été lus. Les règles V9 remplacent les anciennes répartitions.

## Périmètre et fichiers

Les composants sont autonomes. Leur raccordement aux écrans métier constitue **V9-2** ; aucune route de démonstration
n'est livrée. Aucun écran existant n'est modifié dans ce chantier.

| Module | Composants et contrat | Intégration V9-2 |
| --- | --- | --- |
| `pwa/src/quiz/` | `QuizCard({contentId, variantKey, publicationId, onSeek?})`, `useQuiz`, API typée | Sous la transcription de la version ; `onSeek(index)` lit le début du segment adapté avec le lecteur vérifié. |
| `pwa/src/levels/LevelFeedbackButtons.tsx` | `{contentId, variantKey, publicationId, showId?}` ; réutilise `useLevelFeedback` | Version anglaise associée à une émission ; sans `showId`, aucune commande affichée. |
| `pwa/src/related/` | `RelatedList({type,id})`, `useRelated`, `EventGroupCard({group,onCreateDossier,onDismiss?})`, `useEventGroups(since?)`, liens partagés | Détails épisode/article/note et fil Explorer. `onDismiss` est fourni par le fil. |
| `pwa/src/vocabulary/` | `WordPickSheet({word,sentence,contentId,publicationId,variantKey,segmentIndex,onClose})`, `WordPicksList`, hooks, API, validation/statuts | Volet commun de passage anglais ; liste dans Bibliothèque ou Réglages. Remonter le volet avec une `key` par passage. |
| `pwa/src/selection/` | `SelectionProvider`, `useSelection`, `SelectableCard({item,children})`, `SelectionBar({onCreate,busy?,bottomClassName?})`, `CreateDossierFromSelection` | Fournisseur commun aux cartes et à la barre ; réserver la hauteur réelle du mini-lecteur dans le Shell. |

Services API, hooks, helpers et présentation restent séparés. Tous les fichiers de production ajoutés restent sous
100 lignes. Tailwind, kit shadcn/ui existant, Motion et lucide-react, sans nouvel import MUI ni dépendance UI.

Deux fichiers existants complètent les nouveaux modules :

- `pwa/src/api/client.ts` : callback **optionnel** `onResponse`, appelé après une réponse JSON réussie ; permet de distinguer
  création 201 et sélection déjà gardée 200. Transport, session et contrôles CSRF inchangés.
- `pwa/package.json` et lockfile : Testing Library React/DOM et jsdom, **développement seulement**. Ces paquets n'étaient pas
  présents dans cette PWA malgré la mention du brief K8.

## Comportements

- Quiz : première réponse protégée des doubles clics ; corrections et score conservés dans le cache de la publication ;
  questions déjà répondues restaurées par GET ; aucun rendu sans quiz. En erreur, relecture pour retrouver le premier choix
  conservé par le serveur, notamment après un conflit ou une perte de réponse réseau.
- Niveau : avis modifiable, publication explicite envoyée au serveur, avis d'une autre publication ignoré. Le serveur n'offre
  pas de GET de l'avis ; la surbrillance est donc celle connue dans la session React Query, comme dans le hook existant.
- Rapprochements : cinq voisins fournis par le serveur, groupes et liens internes. Un groupe de plus de six membres ne crée
  pas silencieusement un dossier tronqué : le bouton est désactivé et invite à choisir de deux à six sources.
- Vocabulaire : expression modifiable, validation locale de longueur/inclusion/huit mots, validation de publication laissée
  au serveur, confirmation explicite « déjà gardé », quatre statuts et pagination par curseur, suppression Discover seulement.
- Sélection : références différenciées par type et identifiant, ordre conservé, limite six, création autorisée à partir de deux.
  Appui long 500 ms, annulation du geste au défilement, clic consécutif absorbé, accès clavier par bouton, vibration facultative.
  Retour navigateur/Android ou Annuler ferment la sélection. La création ouvre le `DossierPrepareDialog` existant puis vide
  la sélection ; elle ne lance jamais automatiquement la préparation.
- Chargement, erreur avec reprise, absence de données et hors ligne sont pris en compte ; les écritures sont désactivées hors
  ligne. Les données affichées hors ligne proviennent du cache mémoire React Query, sans nouvelle promesse de persistance.

## Vérifications

| Projet | Commandes | Résultat |
| --- | --- | --- |
| PWA Discover | `npm test`, `npx tsc --noEmit -p .`, `npm run build` | **180 tests / 31 fichiers**, types et build verts |
| Worker Discover | `npm test`, `npx tsc --noEmit -p .` | **342 tests / 30 fichiers**, types verts |
| Atelier | `python3 -m unittest discover -s tests -q` | **267 tests**, verts |
| EnglishFluency Worker | `npm test` | **223 tests / 17 fichiers**, verts |
| EnglishPWA | `npx tsc -b && npm test -- --run && npm run lint && npm run build` | **90 tests / 15 fichiers**, types, lint et build verts |

Les tests d'interaction ajoutés couvrent quiz (envoi unique, correction, reprise, ancienne réponse, vide), avis de niveau
(publication, modification), rapprochements (liens, vide, erreur, références, limite), vocabulaire (validation, idempotence,
édition, pagination, suppression, vide), sélection (types, limites, clavier, retour, appui long, défilement et annulation)
et création suivie de l'ouverture des options. Les suites existantes restent exécutées intégralement.

Recette visuelle locale dans des cadres de **375 et 720 px**, avec composants réels et API entièrement fictive : quiz,
volet mot gardé, confirmation 200 et sélection de deux sources. Les fichiers temporaires de recette sont retirés.
Captures locales : `/private/tmp/discover-v9-1-375.png`, `/private/tmp/discover-v9-1-720.png`,
`/private/tmp/discover-v9-1-vocabulary.png`, `/private/tmp/discover-v9-1-selection.png`.
Ce contrôle de composants ne remplace pas la recette intégrée de V9-2 ni la validation sur Fold7.

Les tests Worker/Atelier ont nécessité l'autorisation d'ouvrir des ports loopback ; les contrôles EnglishPWA celle d'écrire
leurs artefacts de build. Dans le worktree Discover, les types Worker locaux ignorés ont été copiés depuis le checkout principal.
Aucun appel payant réel, déploiement, migration distante ou envoi de vocabulaire réel.
Avertissements préexistants non bloquants : taille du bundle Discover, corps audio lu comme texte dans un test Worker,
et nettoyage d'un faux HTTPError Python.

## Suite

V9-1 est prêt pour revue sur sa branche, sans fusion dans `main`. Prochain chantier : V9-2, intégration dans les écrans,
volet de passage commun avec I3, accès aux mots gardés et recette locale en lecture sur API de production.
La branche et les fichiers de l'Atelier n'ont pas été modifiés par ce chantier.
