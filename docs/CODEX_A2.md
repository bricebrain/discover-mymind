# A2 — My Mind complet, API serveur

Livraison du 19 octobre 2026, branche `codex/a2-my-mind`, base `ae76f95`.
Worktree : `/Users/brice/mesProjects/myMobileProjects/discover-mymind-codex-a2`.
Périmètre : Worker et documentation uniquement. Aucune modification de `pwa/` ni des sources de `convert/`.
Aucun déploiement, migration de production ou appel payant. Relecture, fusion et déploiement confiés à Claude Opus.

## Fichiers et choix

- `worker/src/mind/validation.ts` : validations existantes extraites, états des questions ajoutés.
- `worker/src/mind/links.ts` : validation des cibles, variantes et passages ; écritures conditionnelles des liens.
- `worker/src/mind/search.ts` : liste filtrée et recherche FTS5 paginée.
- `worker/src/routes/reflections.ts` : création/PATCH avec `questionState`, contrôle de conflit renforcé ; exports existants conservés.
- `worker/src/index.ts` : **point partagé**, une seule ligne de routage ajoutée pour `GET /api/reflections/search`.
- `worker/migrations/0019_mind_search.sql` : reprise de l’index, trois triggers, index d’ordre, jeton interne de mutation.
- `worker/test/mind-search.test.ts`, `worker/test/mind-links.test.ts` : 11 nouveaux tests fonctionnels dans le runtime Cloudflare local.

Aucune dépendance ajoutée. Le module de routes passe de 254 à 163 lignes ; chaque nouveau fichier reste sous 300 lignes.
Les dépendances Worker sont réutilisées par un lien local vers l’installation existante, retiré après validation.
Le fichier ignoré `worker-configuration.d.ts` provient du checkout principal, dont la configuration Worker est identique.

## Contrat pour la nouvelle UI

### Recherche

`GET /api/reflections/search?q=économie&cursor=…`

- Session requise, mêmes protections que les autres routes `/api`.
- Recherche dans le **titre et le corps complet** : mots littéraux combinés par ET, insensibles à la casse et aux accents.
  Les opérateurs FTS, la recherche de préfixes et la recherche de sous-chaînes ne sont pas exposés.
- `q` : 1 à 200 caractères après suppression des espaces en bordure, avec au moins une lettre ou un chiffre ; sinon 400 `invalid_search`.
- 30 notes par page ; tri stable `updatedAt DESC, id DESC` ; `nextCursor: string | null`.
  Réenvoyer le curseur tel quel, encodé avec `encodeURIComponent` / `URLSearchParams`, avec les mêmes filtres et la même recherche.
  Curseur malformé ou provenant d’autres paramètres : 400 `invalid_cursor`.
- Corbeille toujours exclue, même avec `trash=1`.
- Réponse : `{ reflections: [...], nextCursor }`, mêmes métadonnées que la liste (`id`, `title`, `kind`, `questionState`,
  `origin`, `sourceName`, `tags`, dates, `firstLinkTitle`, `linkCount`), plus un extrait FTS contextualisé :

```json
{
  "excerpt": "… une question sur l’économie …",
  "highlights": [
    { "text": "… une question sur l’", "highlighted": false },
    { "text": "économie", "highlighted": true },
    { "text": " …", "highlighted": false }
  ]
}
```

Rendre chaque fragment comme texte React, éventuellement dans `<mark>` lorsque `highlighted` vaut `true`.
Aucun HTML de surlignage n’est renvoyé ; ne pas utiliser `dangerouslySetInnerHTML`.
L’extrait peut venir du titre si celui-ci est le meilleur passage trouvé par FTS5.

### Liste et filtres

`GET /api/reflections?kind=question&tag=économie&origin=article&question_state=thinking`

- Filtres cumulables, également acceptés par la recherche.
- `kind` : `idea | question | opinion | observation | synthesis`.
- `tag` : une étiquette exacte, sensible à la casse ; espaces externes supprimés, 40 caractères maximum.
- `origin` : `personal | article`.
- `question_state` : `to_explore | thinking | deepened`.
- Valeur invalide ou vide : 400 `invalid_filter`.
- La liste conserve son plafond historique de **500 notes par page**, son extrait de 280 caractères et `trash=1`.
  Ajouts compatibles : `questionState`, `nextCursor`. La pagination de la liste permet de dépasser les 500 notes.

### État des questions

Le **JSON** de POST/PATCH utilise `questionState` (camelCase, comme la réponse existante).
Le **paramètre de filtre** utilise `question_state`.

```json
{
  "baseUpdatedAt": "2026-10-19T00:00:00.000Z",
  "questionState": "deepened"
}
```

Valeurs : `to_explore | thinking | deepened | null` ; `null` efface l’état, omission conserve la valeur au PATCH.
Au POST, omission donne `null`. Une valeur invalide renvoie 400 `invalid_body`.
L’état reste indépendant de `kind`, conformément au schéma existant ; changer le type n’efface pas implicitement l’état.

### Liens, citations et conflits

- Format inchangé : `links: [{ targetType, targetId, variantKey?, segmentId?, quote? }]`, 20 liens maximum.
- Cible épisode ou contenu obligatoire et existante ; contenu supprimé refusé.
- `variantKey` / `segmentId` ne sont acceptés que pour un contenu ; un passage exige une variante.
  La variante doit appartenir à la publication courante prête, le passage doit exister dans son document de segments R2.
- Cible/variante/passage inconnu : 422 `unknown_target` ; combinaison malformée : 400 `invalid_body` ;
  document R2 manquant : 503 `segments_missing`.
- Citation libre conservée, 500 caractères maximum ; elle n’est pas présentée comme une citation vérifiée automatiquement.
- `links` omis conserve les liens ; `links: []` les efface ; tableau fourni remplace les liens, comme auparavant.
  Des références identiques (cible + variante + passage) gardent le dernier exemplaire, conformément à la clé existante.
- Un conflit `baseUpdatedAt` renvoie toujours 409 avec `current`. L’UPDATE conditionnel et toutes les écritures de liens
  appartiennent au même batch D1 transactionnel. Un UUID interne `mutation_token` conditionne les DELETE/INSERT de liens
  au seul PATCH gagnant, y compris si deux requêtes ont calculé le même horodatage.
  Le jeton reste interne ; les champs des réponses My Mind et de l’export historique ne changent pas.
- La date de PATCH avance d’au moins une milliseconde pour éviter deux versions successives avec la même base.

## Migration 0019 et couverture de l’index

Nécessaire avant d’exécuter ce Worker. **Appliquée seulement dans les bases éphémères des tests.**
La migration retire les anciennes entrées `kind='reflection'`, reconstruit les notes actives et conserve les autres types éventuels.
Les triggers assurent la cohérence atomique après insertion, changement titre/corps/corbeille et suppression définitive.
Ils couvrent aussi les INSERT directs depuis Articles et l’UPDATE de récupération Atelier, sans modifier ces routes.
Les changements de tags, état, attribution ou préparation anglaise n’affectent pas les champs indexés.
Les tests existants vérifient toujours l’attribution Article, la préparation anglaise et les synchronisations de notes.

Extension proposée, **non implémentée** : indexer ultérieurement les articles Explorer avec `kind='article'` et une route dédiée,
avec leurs propres règles de disponibilité et de suppression. La recherche My Mind reste limitée aux notes, dont les notes Article.

Référence transactionnelle D1 vérifiée : [API batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Vérifications

- `cd worker && npx tsc --noEmit -p .` : succès.
- `cd worker && npm test` : **265 tests réussis, 23 fichiers** (dont 11 tests ajoutés par A2).
- Dans le checkout existant `convert/`, uniquement `python3 -m unittest discover -s tests -q` : **220 tests réussis**.
  Sa branche et ses sources n’ont pas été modifiées. La suite signale un ResourceWarning de fermeture HTTP en Python 3.15.
- `git diff --check` : succès. Aucun fichier PWA dans le diff.
- Avertissement Worker de la suite existante : lecture d’un corps `audio/mpeg` avec `.text()` dans un test.
  Aucun échec associé.

Couverture ajoutée : corps au-delà de l’extrait initial, titre, accents, fragments de surlignage, résultats vides,
pagination et égalités de dates, filtres combinés, états modifiables/effaçables, paramètres invalides et authentification,
cycle édition/corbeille/restauration/purge, idempotence, création depuis Articles, récupération Atelier,
reprise réelle de migration, liens multiples/citations, cibles invalides sans écriture partielle, 409 avant et après lecture.
Le dernier cas force une course à horodatage identique et vérifie les liens et l’index du gagnant.

## Limites et suite manuelle pour Opus

- Relire et fusionner la branche ; appliquer 0019 avant de publier le Worker. Aucun changement de production effectué ici.
- Brancher les filtres, curseurs et fragments de surlignage dans la nouvelle UI ; distinguer les brouillons locaux non synchronisés,
  absents par définition de la recherche serveur. La PWA n’a pas été construite ni modifiée dans ce chantier.
- Pagination sans instantané : une note modifiée entre deux pages peut remonter avant le curseur ; relancer la recherche pour l’actualiser.
- La reprise FTS recopie les corps des notes actives ; taille et durée sur la base réelle à contrôler avant migration par Opus.
- Les références de passages utilisent le contrat existant (variante + segment, sans identifiant de publication historique).
  La validation porte sur la version courante ; le versionnement durable des liens demanderait un contrat distinct.
- Comportement préexistant signalé : `routes/contents.ts::remove` efface les liens vers un contenu supprimé, contrairement aux liens
  épisode qui gardent leur titre. Cette politique n’a pas été changée dans A2 ; à arbitrer séparément si leur conservation est souhaitée.
- Aucun test physique Fold7 ni mesure CPU/quota de production dans ce chantier.

## Commit de code

`fe18144` — Compléter l’API My Mind et sécuriser ses liens concurrents.

La documentation est livrée dans un second commit ciblé, sur la même branche.
