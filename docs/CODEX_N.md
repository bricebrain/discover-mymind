# N — I7 : suggestion de niveau par émission

Branche : `codex/n-i7`, issue de `main` (`65955bf`).
Worktree : `../discover-mymind-codex-n`.
Périmètre : Worker uniquement. Aucun changement PWA, Atelier, export, préparation ou réglage automatique.

## Livraison

- `worker/migrations/0021_level_feedback.sql` : table `level_feedback`, unicité `(publication_id, variant_key)`, index `(show_id, id DESC)`.
- `worker/src/levels/suggestion.ts` : règle pure et lecture SQL limitée aux deux derniers retours de l'émission.
- `worker/src/levels/routes.ts` : validation, association version/émission, enregistrement, correction, annulation.
- `worker/src/index.ts` : deux raccordements de routes, après session et protection CSRF existantes (fichier partagé).
- `worker/src/routes/episodes.ts` : ajout rétrocompatible de `episode.levelSuggestion` dans le détail.
- `worker/test/level-feedback.test.ts` : tests de règle et d'intégration D1/API.
- `worker/test/security.test.ts` : ajout de la table à la liste exhaustive du schéma attendu.

## Règle et choix

Progression ordonnée : `A2 → B1 → B2 → C1 → original` (et inversement). `original` est le dernier palier,
au-dessus de C1 ; aucune création d'un niveau C2. Seules les versions anglaises d'une émission sont évaluables.
Le niveau est déduit côté serveur : source anglaise = `original`, adaptation = CEFR publié,
traduction anglaise sans CEFR = `original`. Les sources françaises, notes et dossiers ne produisent pas de retour de niveau.

On examine les **deux derniers retours actifs de l'émission**, toutes versions confondues, dans l'ordre de leur premier envoi.
Ils doivent tous deux concerner le niveau actuellement configuré (`shows.auto_level`). Deux `too_easy` proposent un seul
palier supérieur ; deux `too_hard` proposent un seul palier inférieur. Un `just_right`, un avis opposé ou un niveau différent
interrompt la série. On ne recherche jamais deux avis concordants en sautant les avis intermédiaires.

Un même couple publication/version ne compte qu'une fois : les renvois et corrections gardent son ordre initial.
L'annulation supprime le retour de la série ; les retours précédents redeviennent adjacents.
Un nouvel avis après annulation devient un nouveau retour, placé en fin de série. Une republication constitue une nouvelle
version évaluée ; son identifiant est obligatoire pour éviter d'attribuer une écoute ancienne au nouveau niveau.
La série n'est pas consommée par une lecture GET, ni automatiquement appliquée. Un PATCH vers le niveau proposé rend les
anciens avis de l'ancien niveau inéligibles. Revenir manuellement à cet ancien niveau peut rendre la proposition visible à nouveau.

Le serveur accepte le retour déclaratif de l'utilisateur sans exiger une progression `completed` : il peut avoir suffisamment
écouté pour juger avant la fin. La PWA choisit quand présenter l'action.

## Contrat exact pour Opus

Routes sous les protections existantes : session quand `AUTH_DISABLED=false`, CSRF pour les écritures,
réponses JSON avec `Cache-Control: no-store`. Le réglage `AUTH_DISABLED` reste inchangé.

### POST /api/contents/:id/variants/:key/feedback

Corps JSON, 1 024 octets maximum ; **seuls** ces deux champs sont acceptés :

```json
{ "publicationId": "identifiant-rendu-par-le-detail-du-contenu", "rating": "too_easy" }
```

`publicationId` : chaîne non vide, 128 caractères maximum.
`rating` : `too_easy` (« trop facile »), `just_right` (« juste »), `too_hard` (« trop dur »), ou `null` pour annuler.
Ne pas envoyer le niveau ni l'émission : ils sont déduits de la version publiée et de sa source.

La publication doit appartenir au contenu, contenir la variante et être visible : publication courante `ready`,
ou publication `superseded` depuis moins de sept jours, comme pour les médias existants. Le contenu ne doit pas être supprimé.
L'association se fait via `contents.source_ref` : `episode:<id>` pour les podcasts, `youtube:<videoId>` pour une chaîne suivie.

Succès **200**, y compris renvoi, correction ou annulation déjà effectuée :

```json
{
  "feedback": {
    "contentId": "episode-test",
    "variantKey": "en-b1",
    "showId": "mon-emission",
    "publicationId": "publication-test",
    "level": "B1",
    "rating": "too_easy"
  },
  "levelSuggestion": {
    "showId": "mon-emission",
    "currentLevel": "B1",
    "suggestedLevel": "B2",
    "changed": true,
    "reason": "two_too_easy",
    "message": "Deux retours « trop facile » consécutifs au niveau actuel : essayer le niveau supérieur."
  }
}
```

Annulation : même enveloppe avec `"feedback": null` et suggestion recalculée.

### GET /api/shows/:id/level-suggestion

Aucun paramètre ni corps. Succès **200** : `{ "levelSuggestion": { ... } }`, objet identique à celui ci-dessus.
`currentLevel` et `suggestedLevel` sont toujours un des cinq niveaux autorisés. Sans proposition, ils sont égaux,
`changed=false` et `reason` explique pourquoi. Aucun historique complet ni texte long n'est chargé.

| reason | changed | message |
| --- | --- | --- |
| `insufficient_feedback` | false | Deux retours consécutifs sont nécessaires. |
| `different_levels` | false | Les deux derniers retours ne concernent pas le niveau actuel. |
| `no_streak` | false | Les deux derniers retours ne demandent pas le même ajustement. |
| `level_bound` | false | Le niveau actuel est déjà à la limite de la progression. |
| `two_too_easy` | true | Deux retours « trop facile » consécutifs au niveau actuel : essayer le niveau supérieur. |
| `two_too_hard` | true | Deux retours « trop dur » consécutifs au niveau actuel : essayer le niveau inférieur. |

Les codes `reason` sont les valeurs à exploiter ; `message` est une explication française destinée à l'affichage.

### Préremplissage manuel et application

`GET /api/episodes/:id` conserve sa réponse et ajoute **dans** `episode` :

```json
{ "episode": { "id": "…", "showId": "…", "levelSuggestion": { "showId": "…", "currentLevel": "B1", "suggestedLevel": "B2", "changed": true, "reason": "two_too_easy", "message": "…" } } }
```

`PrepareDialog` pourra préremplir `suggestedLevel` à partir du détail de l'épisode. La liste Explorer et la liste des émissions
ne changent pas. La nouvelle route dédiée permet de rafraîchir une suggestion après un retour.
Après accord explicite de l'utilisateur, appliquer le réglage avec le **PATCH existant** :
`PATCH /api/shows/:id`, corps `{ "autoLevel": "B2" }`, réponse **200** `{ "show": { ... } }` inchangée.
Ni le POST feedback ni les GET ne modifient une émission, la file de préparation ou un contenu.

### Erreurs

Format commun : `{ "error": { "code": "…", "message": "…" } }`.

| HTTP | code | Cas |
| --- | --- | --- |
| 400 | `invalid_json` | Corps non JSON valide |
| 400 | `invalid_body` | Objet attendu, champ absent/inconnu, rating invalide, publicationId vide ou trop long |
| 401 | `unauthenticated` | Session absente/expirée quand l'authentification est active |
| 403 | `csrf_origin` / `csrf_client` | Protection CSRF existante (POST) |
| 404 | `not_found` | Émission inconnue ; contenu/variante/publication indisponible, supprimé, expiré, ou sans émission associée ; chemin hors formats existants |
| 413 | `payload_too_large` | Corps supérieur à 1 024 octets |
| 415 | `unsupported_media_type` | Content-Type différent de application/json (protection existante) |
| 422 | `unsupported_level` | Version non anglaise ou niveau publié hors A2/B1/B2/C1/original |

## Stockage, coût et limites

Le retour conserve la publication, le contenu, la variante, l'émission et le niveau, avec dates de création/modification.
L'identifiant entier croissant détermine un ordre stable, même si plusieurs retours ont la même date.
Le nettoyage des publications ne supprime pas les retours historiques : pas de FK vers `publications` ou `variants`.
La suppression physique d'une émission supprime ses retours par cascade ; un simple désabonnement conservant l'émission
les garde. La modification/annulation par cette API exige toujours une version encore lisible (fenêtre de sept jours
pour les anciennes publications). Aucun export de ces nouveaux retours dans l'export v2 existant : hors brief N.

Deux petites lectures D1 par suggestion : émission par clé primaire, puis `ORDER BY id DESC LIMIT 2` avec l'index par émission.
Aucun agrégat non borné, accès R2, calcul lourd, appel IA ou génération audio. Pas de nouvelle dépendance.
Le budget CPU réel en production reste à mesurer lors de l'intégration ; aucun chiffre de latence n'est promis.

## Vérifications et intégration

- `npx tsc --noEmit -p .` : réussi.
- `npx vitest run test/level-feedback.test.ts` : 19 tests réussis lors de la première passe ; 20 tests I7 dans la suite finale après ajout du cas YouTube.
- `npm test` : 24 fichiers et 285 tests réussis (dont 20 I7).
- `git diff --check` : réussi.
- La première passe complète a relevé le test exhaustif des tables ; corrigé en ajoutant `level_feedback` à la liste attendue.
- Tests Python non applicables : aucun fichier `convert/` modifié. Pas de build PWA (périmètre interdit).
- Dépendances locales réutilisées pour les tests ; types Worker locaux existants copiés dans le worktree, non livrés.

À l'intégration : relire et fusionner la branche, appliquer **0021** avant de servir les nouvelles routes,
puis brancher l'interface chez Opus. Migration uniquement testée sur D1 local par Vitest ; aucun déploiement,
aucune migration de production, aucun appel payant effectué pendant ce chantier.
