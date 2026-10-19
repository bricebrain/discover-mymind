# L5 — Niveau suggéré dans Abonnements

Branche : `codex/l5-level-suggestion`, issue de `main` (`6e5f385`).
Worktree : `/private/tmp/discover-mymind-codex-l5`.

## Livraison et périmètre

- `pwa/src/pages/ShowsPage.tsx` : raccordement dans les lignes podcast uniquement.
- `pwa/src/api/shows.ts` : GET de la suggestion et invalidation après le PATCH existant d’une émission.
- `pwa/src/shows/LevelSuggestion.tsx` : proposition « Essayer B2 ? » (ou « Essayer l’original ? »), raison serveur,
  boutons Appliquer et Ignorer ; composants `Notice`, `Spinner` et `Button` du kit existant.
- `pwa/src/shows/useShowLevelSuggestion.ts` : orchestration de lecture, refus et application explicite.
- `pwa/src/shows/suggestionLogic.ts` : conditions d’affichage et stockage local protégé à la lecture et à l’écriture.
- `pwa/src/levels/{types,keys,api,useLevelFeedback}.ts` : contrat, clés React Query, service et hook sans interface.
- Tests : `pwa/src/levels/useLevelFeedback.test.ts`, `pwa/src/shows/levelSuggestion.test.ts`,
  `pwa/src/shows/LevelSuggestion.test.tsx`.

Aucun fichier Opus, Worker, Atelier, dépendance ou configuration modifié. Aucun import `@mui` ajouté.
Aucun déploiement, migration ou appel payant. La branche principale conserve son état ; intégration par fusion de cette branche.

## Comportement

Une proposition n’apparaît que pour `changed: true`, la bonne émission et le niveau encore configuré.
Un résultat ancien ne propose donc pas un changement depuis un autre niveau. Le PATCH ne transmet que `autoLevel` :
il n’active pas les préparations automatiques et ne modifie ni la formule ni la file.
La lecture initiale et le rafraîchissement n’appliquent jamais un niveau.

Ignorer conserve une clé `discover:ignored-level:<émission encodée>:<niveau>` dans `localStorage`.
Chaque niveau de chaque émission est indépendant. Si le stockage est interdit ou plein, le refus reste effectif
en mémoire pendant la présence de la ligne à l’écran. Le refus persistant reste valable lorsque le même niveau est proposé plus tard.

Le chargement possède un indicateur accessible ; une lecture en erreur propose Réessayer. Sans changement, rien n’est affiché.
Un PATCH en erreur conserve les choix et affiche l’erreur. Les boutons ont une hauteur de 44 px et passent à la ligne
sur une largeur réduite ; ils sont bloqués pendant une écriture ou un rafraîchissement de la suggestion.

## Contrat pour Opus : feedback sans interface

```tsx
import { useLevelFeedback } from '../levels/useLevelFeedback';

const feedback = useLevelFeedback(contentId, variantKey);
feedback.mutate({ publicationId, rating: 'too_easy' });
// Autres valeurs : 'just_right', 'too_hard', null (annulation).
// feedback.mutateAsync(...) est disponible également.
```

- Fournir le `publicationId` effectivement écouté, jamais celui d’une republication récupérée ensuite.
- Le service n’envoie que `publicationId` et `rating` ; le serveur déduit émission et niveau.
- `feedback.feedback` expose le dernier avis connu dans le cache React Query pour ce contenu et cette variante,
  ou `null`. Avant toute présélection, comparer son `publicationId` à celui affiché.
- L’API ne possède aucun GET du feedback : un premier montage après rechargement ne récupère pas un avis historique.
  `null` indique donc aussi qu’aucun avis n’est connu localement. Le cache reste soumis au cycle de vie habituel de React Query.
- Les champs habituels de mutation (`isPending`, `isError`, `error`, etc.) restent disponibles.
- Après succès, le hook met à jour le retour connu, actualise la suggestion renvoyée puis invalide `['shows']`
  et `['level-suggestion', showId]`. Une annulation remet le retour à `null` ; un échec conserve l’avis précédent.
- La cible de l’écriture de cache est conservée au début de la mutation, même si la version affichée change entre-temps.

L’interface des trois boutons de feedback reste entièrement à Opus. Aucun changement Shell requis :
la proposition utilise l’écran Abonnements et son titre existants, sans nouvelle page ni route.

## Vérifications

Dans `pwa/` :

- `npx --no-install tsc --noEmit -p .` : réussi.
- `npm test` : 22 fichiers, 128 tests réussis, dont 19 nouveaux tests L5.
- `npm run build` : réussi, y compris le service worker ; avertissement Vite sur le bundle principal supérieur à 500 ko.
- `git diff --check` : réussi ; aucun import `@mui` dans les fichiers livrés.

Les tests du hook utilisent le vrai moteur de mutations/cache React Query, avec un adaptateur des hooks sans DOM et
des réponses HTTP simulées : contrats, correction, annulation, isolement par variante/contenu, erreurs et invalidations.
Le rendu est vérifié par React DOM Server : proposition, absence, chargement, erreurs et verrouillage des actions.
La logique pure couvre les données périmées et le stockage absent, refusé ou plein.
Les dépendances installées du checkout principal sont réutilisées par lien local, sans modification des manifestes.

Recette manuelle restante : après fusion, vérifier sur Fold7 plié/déplié une émission avec deux avis concordants,
ignorer puis recharger, proposer un autre niveau, appliquer et vérifier le nouveau réglage.
Les tests n’envoient aucun feedback ni PATCH vers la production.
