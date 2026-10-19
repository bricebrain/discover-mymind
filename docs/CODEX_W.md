# Chantier W — I8 : bilan hebdomadaire et export NotebookLM

Branche : `codex/weekly-i8`. Worktree : `../discover-mymind-codex-weekly-i8`.
Périmètre : Worker uniquement. Aucun changement PWA/Atelier, déploiement, migration distante ou appel IA payant.

## Contrat livré pour Opus

Les deux routes passent par la protection de session existante, avec le comportement habituel si `AUTH_DISABLED=true`.
Elles portent `Cache-Control: no-store` et les en-têtes de sécurité existants.

### GET /api/weekly?week=2026-W43

`week` facultatif : semaine courante à Paris. Format ISO strict `YYYY-Www`, années 2000–2099 ; une semaine 53
inexistante est rejetée. Lundi 00:00 inclus → lundi suivant 00:00 exclu, **Europe/Paris**. Chaque borne est
convertie séparément en UTC : les semaines de changement d’heure ont 167 ou 169 heures.
La semaine précédente utilise le même découpage (y compris 1999 pour la comparaison de 2000-W01).

Réponse 200 d’une semaine vide, avec tous les champs réellement renvoyés :

```json
{
  "week": "2026-W43",
  "timeZone": "Europe/Paris",
  "start": "2026-10-18T22:00:00.000Z",
  "end": "2026-10-25T23:00:00.000Z",
  "previousWeek": "2026-W42",
  "metrics": {
    "listenedMinutes": 0,
    "completedContents": 0,
    "notesCreated": 0,
    "notesModified": 0,
    "articlesRead": 0,
    "articlesSaved": 0,
    "linkedPassages": 0,
    "publishedPreparations": 0
  },
  "previous": {
    "week": "2026-W42",
    "metrics": {
      "listenedMinutes": 0,
      "completedContents": 0,
      "notesCreated": 0,
      "notesModified": 0,
      "articlesRead": 0,
      "articlesSaved": 0,
      "linkedPassages": 0,
      "publishedPreparations": 0
    }
  },
  "delta": {
    "listenedMinutes": 0,
    "completedContents": 0,
    "notesCreated": 0,
    "notesModified": 0,
    "articlesRead": 0,
    "articlesSaved": 0,
    "linkedPassages": 0,
    "publishedPreparations": 0
  },
  "learnedWords": [],
  "limits": { "activities": 200, "noteRevisions": 500, "links": 500 },
  "listeningMethod": "positive_position_deltas"
}
```

`delta` = semaine demandée − semaine précédente, valeurs absolues signées, sans pourcentages.
`learnedWords` est toujours un tableau vide : vocabulaire/I1 hors périmètre.

Définitions :

- `listenedMinutes` : somme des avancées positives de position par audio, divisée par 60 000 et arrondie à
  deux décimales. `PUT /api/progress` conserve son contrat. Son upsert et l’incrément hebdomadaire sont dans
  **le même batch D1 atomique** : doublon de position = zéro ; recul = zéro ; reprise après recul comptabilisée ;
  changement d’audio = nouvelle base zéro. Une position préexistante sert de base, sans être recomptée.
  Les sauvegardes sans avancée ni nouvelle complétion ne figurent pas dans la liste exportée.
- `completedContents` : nombre de cibles audio distinctes (`episode` ou `contentId:variantKey`) ayant eu un
  passage `completed=false` → `true` dans la semaine. Une fin répétée n’est pas recomptée, même la semaine
  suivante ; plusieurs versions d’un contenu peuvent compter séparément. Au plus une complétion par cible/semaine.
- `notesCreated` : notes distinctes créées dans la semaine ; `notesModified` : notes distinctes dont une
  sauvegarde ultérieure à la création est survenue dans la semaine, restauration incluse. Une note peut compter
  dans les deux. Les notes actuellement en corbeille sont exclues des comptes, extraits et citations ; purge =
  suppression de leurs journaux par cascade. Les extraits sont ceux de la dernière révision **dans la semaine**.
- `articlesRead` : articles distincts consultés via `GET /api/articles/:id`, une fois par semaine. Ouvrir le détail
  constitue ici une consultation, pas une preuve de lecture intégrale. Cette route GET écrit désormais le marqueur.
- `articlesSaved` : articles distincts enregistrés via le succès de `POST /api/articles/:id/note`, avec ou sans
  préparation, une fois par semaine. Les contrats de ces deux routes ne changent pas.
- `linkedPassages` : liens distincts rattachés à une note, avec `segmentId` non vide ou citation, enregistrés
  dans la semaine. Déduplication par note/cible/variante/passage. Un simple lien de contenu sans citation ne
  compte pas. Le journal conserve la citation de la semaine même si les liens sont remplacés la semaine suivante.
- `publishedPreparations` : publications distinctes devenues `ready` dans la semaine ; le remplacement d’une
  publication et son nettoyage R2 ultérieur ne changent pas sa date dans le journal. Contenu supprimé = exclu.

### GET /api/weekly/export?week=2026-W43

Même validation et semaine par défaut. Réponse 200 : texte Markdown UTF-8 directement importable dans NotebookLM,
`Content-Type: text/markdown; charset=utf-8`,
`Content-Disposition: attachment; filename="discover-weekly-2026-W43.md"`.
Pas d’enveloppe JSON, ni d’envoi à NotebookLM.

Titres et comptes de la semaine, extraits de notes (2 000 caractères maximum par note), contenus écoutés avec
sources, articles consultés/enregistrés et liens, passages/citations, préparations publiées, rubrique mots hors périmètre.
Les sources HTTP(S) disponibles sont liées ; une cible supprimée conserve son identifiant/titre historique quand disponible.
Pas de contenu intégral, transcription, audio, manifeste R2, configuration, abonnement ou file de préparation.
Les corps des notes ne sont jamais relus depuis leur révision actuelle : un texte ajouté la semaine suivante ne fuit pas.
Le rendu de note réutilise `noteMarkdown` de l’export v2. `/api/export` v1 et v2 restent inchangés.

Le Markdown ne contient aucune activité de la semaine précédente, même si celle-ci apparaît dans la comparaison JSON.
L’absence d’horodatage de génération et les ordres fixes permettent des instantanés reproductibles.

### Erreurs des deux routes

Forme existante : `{"error":{"code":"…","message":"…"}}`.

| HTTP | Code | Cas |
|---|---|---|
| 400 | `invalid_week` | Paramètre mal formé, année hors plage ou semaine ISO inexistante |
| 401 | `unauthenticated` | Connexion requise, si l’authentification est active |
| 422 | `weekly_limit_exceeded` | Une catégorie dépasse son plafond : aucun résultat partiel |
| 500 | `internal_error` | Erreur interne, par exemple migration manquante |

Méthodes autres que GET : comportement actuel du routeur, 404 `not_found` (écritures soumises au contrôle CSRF existant).

## Stockage, coût et limites

Migration réservée **0022_weekly.sql**, à relire puis appliquer lors de l’intégration, pas appliquée en production ici.
Cinq tables : `weekly_listening`, `weekly_articles`, `weekly_notes`, `weekly_links`, `weekly_publications`.
Index par semaine/cible ou par date ; instantanés de notes et liens par triggers, publication au passage `ready`.
Aucun nouveau cron, aucune génération de texte/audio. Les tables sessions, tentatives, push et secrets ne sont pas lues.

Chaque semaine : cinq SELECT bornés à plafond + 1, dans un batch ; JSON : deux semaines donc dix SELECT.
Plafonds **par semaine** : 200 cibles d’écoute, 200 articles, 200 publications, 500 révisions de notes,
500 écritures de liens avant déduplication. Les entrées en corbeille/supprimées et les marqueurs d’écoute nuls
consomment aussi ce budget de lecture avant d’être filtrés. Dépassement de la semaine précédente = 422 pour le
bilan JSON ; l’export ne lit que la semaine demandée. Aucun balayage global ou chargement R2 sur ces routes.
Les corps d’extraits sont limités à l’écriture ; les médias ne sont pas chargés. Ces bornes visent le Worker gratuit ;
le CPU réel en production reste à mesurer lors de la recette, les durées Vitest ne prouvent pas le seuil de 10 ms.

**Historique avant migration** : la progression ne conservait que la dernière position, aucun historique de durée
n’est inventé. Écoutes/articles sont suivis à partir de l’intégration. Pour les notes existantes, seule leur dernière
révision connue est reprise, à `updated_at` ; pour les liens, les liens actuels avec leur date ; pour les publications,
les publications actuellement `ready` à leur date `updated_at`. Les anciennes révisions remplacées et consultations
ne peuvent pas être reconstruites. Présenter ces semaines comme partielles, pas comme une mesure exhaustive.

L’estimation d’écoute ne distingue pas un saut vers l’avant d’une lecture, ni le temps réel à vitesse accélérée.
Une synchronisation hors ligne est attribuée à sa réception serveur, pas à sa date d’écoute inconnue du contrat actuel.
Les notes modifiées dans une même milliseconde partagent un instantané (contrôle de conflit existant inchangé).
Les marqueurs des articles supprimés disparaissent avec eux. Les dates du bilan sont des dates d’activité,
pas les dates de parution éditoriale des articles/épisodes. Les journaux grandissent avec l’utilisation ; pas de purge
arbitraire d’historique ajoutée dans ce chantier.

## Fichiers

- `worker/src/weekly/{week,activity,data,markdown,routes}.ts` : dates, suivi, lectures bornées, rendu et route.
- `worker/migrations/0022_weekly.sql` : tables, index, triggers et reprise limitée des données connues.
- `worker/src/index.ts` : deux branchements GET derrière la protection existante.
- `worker/src/routes/progress.ts` : batch atomique avec suivi hebdomadaire.
- `worker/src/articles/routes.ts` : marquage consultation/enregistrement.
- `worker/src/export/markdown.ts` : exposition du rendu de note existant, sans changer son comportement.
- `worker/src/routes/reflections.ts` : purge comptée via `RETURNING id` pour ne pas inclure les cascades dans le total.
- `worker/test/weekly*.test.ts`, `worker/test/__snapshots__/weekly.test.ts.snap` : recette automatisée W.
- `worker/test/security.test.ts` : inventaire des cinq nouvelles tables.

## Validation et intégration

Vérifications finales dans `worker/` :

- `npm test` : **25 fichiers, 287 tests réussis**, dont 22 tests spécifiques à W ; deux instantanés Markdown stables.
- `npx tsc --noEmit -p .` : réussi.
- `git diff --check` : réussi.

Les tests couvrent semaines vides, bornes ISO/année, deux changements d’heure, session, corbeille, révisions/citations
historiques, estimation d’écoute et doublons, rollback D1, consultations/enregistrements d’articles, publication
remplacée/nettoyée, comparaison précédente, dépassement des plafonds et absence de données d’autres semaines/tables.
Les dépendances existantes ont été réutilisées temporairement via un lien local, retiré avant livraison ;
aucune dépendance n’a été ajoutée. Pour relancer dans le worktree, installer les dépendances Worker comme d’habitude.
Le code de la PWA et de l’Atelier n’étant pas modifié, leurs commandes de validation ne sont pas exécutées.
Intégration manuelle par Opus : relire/fusionner la branche, sauvegarder D1 et appliquer 0022, puis brancher
l’interface aux deux GET. Vérifier une semaine courante, une semaine vide, l’affichage de l’historique partiel et le
CPU en situation réelle. Aucun déploiement ni changement d’authentification n’est inclus.
