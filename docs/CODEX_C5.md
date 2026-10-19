# C5 — Écran « Ma semaine »

Branche : `codex/weekly-c5`. Worktree : `/Users/brice/.codex/worktrees/weekly-c5/discover-mymind`.

## Livraison et limite bloquant l’acceptation complète

L’écran `/week` fonctionne pour les chiffres et l’export avec le contrat W existant. **C5 reste incomplet pour les listes réelles et leurs liens** : `worker/src/weekly/routes.ts` ne renvoie que les métriques, la comparaison et les métadonnées. Il ne renvoie ni écoutes, ni notes, ni articles, ni publications. Ne pas confondre ces données absentes avec une semaine vide.

Le Markdown est un export de présentation : il ne contient pas les identifiants des notes et des articles. Il ne peut pas fournir les quatre listes internes demandées de façon fiable. Pas de parsing de Markdown, de récupération de l’ensemble des données personnelles ni de déduction d’une activité hebdomadaire à partir des dates actuelles. Le Worker est hors de la colonne C5 et n’a pas été modifié.

L’interface des listes est prête et testée avec un **contrat proposé**, facultatif, `activities` dans `GET /api/weekly` :

```ts
activities: {
  listening: { targetType: 'episode' | 'variant'; targetId: string; title: string; listenedMs: number; completed: number }[];
  notes: { id: string; title: string }[];
  articles: { id: string; title: string; wasRead: number; wasSaved: number }[];
  publications: { id: string; contentId: string; title: string }[];
}
```

Opus doit confirmer et fournir ce complément, en réutilisant les données déjà bornées de `loadWeek` pour la semaine demandée uniquement, sans exposer le corps des notes ni les activités de la semaine précédente. Tant que le champ manque, chaque rubrique indique que son détail est indisponible, avec une explication commune. Un champ présent contenant quatre tableaux vides affiche quatre états vides.

## Fonctionnalités

- Semaine courante à Paris, navigation précédente/suivante dans l’URL `?week=YYYY-Www`, aucun accès futur. Paramètre invalide ou futur ramené à la semaine courante. Première semaine sélectionnable : 2000-W01, conformément au Worker.
- Dates civiles lundi–dimanche et huit métriques, écarts absolus signés à deux décimales maximum, aucune appréciation de valeur des baisses/hausses.
- États chargement, actualisation, vide encourageant, erreur avec reprise, 422 `weekly_limit_exceeded`, hors ligne avec éventuel dernier bilan en cache mémoire React Query. Aucun stockage persistant de bilan ajouté. Un échec serveur masque les anciennes données de la requête.
- Export Markdown direct avec session, nom `discover-weekly-YYYY-Www.md`, libération différée de l’URL Blob, aucun accès au presse-papiers. Le bouton reste utilisable après une erreur du bilan : sa comparaison précédente peut dépasser le plafond alors que l’export de la semaine choisie reste possible.
- Listes présentatives prêtes pour l’extension : épisode `/?e=…`, variante `/library/:id?v=…`, note `/mind?n=…`, article `/?a=…`, publication `/library/:id`. Titres rendus en texte React, identifiants encodés.
- Explications sur l’estimation des minutes, les consultations d’articles, l’historique partiel et la synchronisation hors ligne.

## Fichiers

- `pwa/src/weekly/types.ts` : contrat actuel et extension proposée.
- `pwa/src/weekly/api.ts` : service JSON, export Markdown, téléchargement et messages d’erreur.
- `pwa/src/weekly/helpers.ts` : ISO/Paris, bornes, libellés, écarts et liens d’écoute.
- `pwa/src/weekly/useWeekly.ts` : React Query v5, navigation et état réseau ; mise à jour de la semaine courante chaque minute.
- `pwa/src/weekly/WeeklyMetrics.tsx`, `WeeklyActivities.tsx` : composants présentatifs utilisant le kit partagé.
- `pwa/src/weekly/{helpers.test.ts,api.test.ts,WeeklyActivities.test.tsx}` : tests métier, API/export et rendu pur.
- `pwa/src/pages/WeekPage.tsx` : assemblage, `<h1 className="sr-only">Ma semaine</h1>`.
- `pwa/src/pages/SettingsPage.tsx` : lien en tête, sans autre changement fonctionnel.
- `pwa/src/app/App.tsx` : **une seule ligne** de route avec import dynamique, aucun autre changement.

Aucun nouvel import `@mui/*`, aucune dépendance ajoutée, aucun fichier Opus modifié en dehors de l’unique ligne autorisée dans App. Aucun changement L5, A5, Worker, Atelier, migration, déploiement ou appel payant.

## Validation

Dans `pwa/` :

- `npm test` : 22 fichiers, 137 tests réussis, dont 28 nouveaux tests C5.
- `npx tsc --noEmit -p .` : réussi.
- `npm run build` : réussi, service worker compris. Avertissement Vite sur le gros bundle principal existant ; la page WeekPage est chargée séparément (~9,3 kB avant gzip).
- `git diff --check` : réussi.

Tests ISO couvrant changement d’année, semaine 53 valide/invalide, dimanche soir UTC déjà lundi à Paris, changements d’heure mars/octobre et bornes 2000–2099. Tests du téléchargement (nom, clic, révocation, aucun presse-papiers), erreurs réseau/422/500, huit métriques, absence de données distincte du vide, encodage et rendu des liens.

Les dépendances existantes ont été réutilisées via un lien temporaire, retiré avant livraison. Pas de recette navigateur ni Fold7 physique effectuée.

## Intégration Opus

1. Relire/fusionner cette branche ; pas de déploiement effectué ici.
2. Dans `pwa/src/app/Shell.tsx` (colonne Opus), ajouter au calcul de `title` : `pathname === '/week' ? 'Ma semaine' : …`. Ce fichier n’a pas été modifié ; actuellement la barre affiche « Discover » sur `/week`.
3. Confirmer puis fournir le complément API `activities` ci-dessus pour achever C5 ; tester données supprimées et liens vers une publication remplacée selon le comportement actuel des détails.
4. Recette à 375 et 720 px : Réglages → Ma semaine, navigation et retour navigateur, semaine vide, 422, bascule hors ligne/reconnexion, téléchargement Markdown importable dans NotebookLM ; vérifier les quatre listes quand le complément API sera disponible.
