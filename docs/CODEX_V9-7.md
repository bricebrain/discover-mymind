# V9-7 — Suppression des tables SRT d’EnglishFluency

## État du lot

Préparation locale de la migration approuvée. **Aucune migration ni aucun déploiement en production n’a été exécuté.** L’accord explicite pour l’opération de production V9-7 reste requis, avec sauvegarde préalable de la base `englishfluency` selon le § 6 du brief.

Worktrees :

- Worker EnglishFluency : `/private/tmp/englishfluency-worker-codex-v9-7`, branche `codex/v9-7`, base `feat/lot1` (`fe7b733`), commit livré **`6885aa3`**.
- Compte rendu Discover : `/private/tmp/discover-mymind-codex-v9-7`, branche `codex/v9-7`, base `codex/v9-6` (`063e91e`).

Les checkouts principaux restent sur leurs branches initiales. Le code du Worker et d’EnglishPWA ne contient plus de lecture des tables SRT : recherches insensibles à la casse sur `srt_` et le mot `srt` dans les sources et scripts concernés, sans correspondance. Les références historiques dans les anciennes migrations et les tests de non-régression sont conservées.

## Changements

- Déplacement **sans modification du SQL** de `migrations-en-attente/0018_remove_srt_library.sql` vers `migrations/0021_remove_srt_library.sql`. Aucun historique existant n’est renuméroté : 0018 à 0020 restent réservés/utilisés conformément au brief.
- Retrait du README d’attente obsolète et du dossier `migrations-en-attente/` devenu vide.
- Rétablissement dans `test/securite.test.ts` de l’assertion d’absence de toute table dont le nom commence littéralement par `srt_` (`GLOB 'srt_*'`). Le test des anciennes routes retournant 404 est conservé.
- Ajout de `test/migration-srt.test.ts` : schéma antérieur réel, données dans les quatre tables, clés étrangères activées, conservation des autres tables et des marqueurs de purge sémantique, absence de violation de clés étrangères et rejeu quand les tables sont absentes.

Migration proposée :

```sql
DROP TABLE IF EXISTS srt_scene_questions;
DROP TABLE IF EXISTS srt_scenes;
DROP TABLE IF EXISTS srt_episodes;
DROP TABLE IF EXISTS srt_sources;
```

Les tables enfants sont retirées avant leurs parents. `IF EXISTS` rend les suppressions tolérantes à une absence préalable. Aucun changement dans les anciennes migrations `0012_srt_library.sql` et `0017_ai_features.sql`.

## Recherche sémantique et stockage

La migration ne supprime pas `semantic_index` ni ses anciens marqueurs `source = 'srt'`. L’indexeur peut ainsi encore identifier puis purger les anciens vecteurs. Le test existant `test/semantic.test.ts` vérifie déjà qu’un ancien vecteur SRT n’apparaît plus en recherche, puis est purgé avec son marqueur lors de l’indexation simulée. Il passe après application de 0021 dans l’environnement de test.

Aucune suppression d’objets R2 n’est ajoutée au lot. Aucun appel réel à un fournisseur IA, aucune indexation distante ni aucune purge distante n’a été lancé.

## Validation

Tests ciblés migration / sécurité / recherche sémantique : **83 tests passent**, dont les deux nouveaux tests de migration et le contrôle de sécurité rétabli.

Suites obligatoires complètes : **1 182 tests passent**.

- Worker EnglishFluency : **226 tests / 18 fichiers**, `npx tsc --noEmit -p .` réussi.
- PWA Discover : 218 tests / 39 fichiers, TypeScript et build réussis.
- Worker Discover : 345 tests / 31 fichiers, TypeScript réussi.
- Atelier : 303 tests, contrats du worktree V9-7 et configuration factice du worktree Atelier V9-5 conservé.
- EnglishPWA : 90 tests / 15 fichiers, TypeScript, lint et build réussis.

Les migrations ne sont appliquées que sur SQLite en mémoire par les tests, jamais sur une base locale persistante ni distante. Le SQL déplacé est identique octet pour octet à l’original (SHA-256 `cb042864b5236b0aa16771ad7d66c7332d612e71d589a13549277de4bfb3390e`). Les avertissements existants de taille de bundle, lecture de corps audio dans un test et SQLite expérimental ne constituent pas des échecs.

## Opération de production à approuver séparément

Ce qui partirait : migration **0021**, suppression définitive des quatre tables et des données SRT, puis déploiement du Worker depuis le lot validé. Aucun fichier source actif du Worker n’a changé dans ce lot. Aucun déploiement EnglishPWA ni Discover n’est nécessaire pour cette suppression.

Risques : perte des données des quatre tables sans restauration depuis sauvegarde ; les anciens vecteurs restent stockés jusqu’à leur purge normale par l’indexeur, tout en étant masqués en recherche par le code existant. Cette purge distante n’est pas déclenchée par les tests.

Après accord explicite sur V9-7, depuis le worktree Worker :

1. Vérifier l’historique réel avec `npx wrangler d1 migrations list englishfluency --remote`. Confirmer que 0021 est bien la seule migration nouvelle à appliquer ; suspendre si l’état distant diffère du brief.
2. Capturer le point Time Travel avec `npx wrangler d1 time-travel info englishfluency` et consigner le bookmark dans `discover-backups/ef-time-travel-bookmark-avant-0021.txt`.
3. Lister les tables distantes puis exporter **table par table**, en excluant les tables internes (`sqlite_*`, `_cf_*`), les tables virtuelles et leurs tables de stockage FTS (`%_fts%` et tables auxiliaires associées). Conserver impérativement les quatre tables SRT et `semantic_index`. Construire les options `--table` dans un tableau zsh ; écrire l’export dans `discover-backups/ef-d1-avant-0021-<date>.sql`. Vérifier la présence des quatre tables dans l’export et consigner les résultats avant d’appliquer la migration.
4. Exécuter `npx wrangler d1 migrations apply englishfluency --remote`, puis vérifier l’historique, l’absence de toute table `srt_*` et la conservation des tables hors SRT.
5. Déployer le Worker avec `npm run deploy`, vérifier sa santé et le maintien des anciennes routes SRT à 404 ; vérifications en lecture seulement, aucun appel payant pour la recette.

Le chemin de sauvegarde est le dossier partagé `/Users/brice/mesProjects/myMobileProjects/discover-backups/`, pas un dossier relatif au worktree dans `/private/tmp`. Ne pas lancer d’export complet D1 : les tables FTS5 peuvent le faire échouer. Ne pas considérer un bookmark seul comme le remplacement de l’export demandé par le brief.

En cas d’échec, conserver export, bookmark et diagnostics ; aucune restauration automatique de la base entière ne sera lancée, car elle pourrait affecter d’autres écritures. Une restauration doit être préparée et validée à partir de la sauvegarde.

## Suite

La préparation de V9-7 est livrée, commit Worker `6885aa3`, avec les résultats des suites ci-dessus. La production attend son accord de lot. Le travail V9-8 signalé dans le brief reste distinct de cette migration.
