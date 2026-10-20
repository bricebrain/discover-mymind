# V9-7 — Suppression des tables SRT d’EnglishFluency

## État du lot

**V9-7 exécuté en production le 20 octobre 2026**, après l’accord explicite de l’utilisateur : sauvegarde vérifiée de la base `englishfluency`, application de **0021**, déploiement et recette en lecture seule. Les quatre tables SRT sont absentes, aucune migration ne reste en attente. Version Worker active : **`8864006d-5951-4683-9324-2a3ae9193fd7`**.

Worktrees :

- Worker EnglishFluency : `/private/tmp/englishfluency-worker-codex-v9-7`, branche `codex/v9-7`, base `feat/lot1` (`fe7b733`), commit livré **`6885aa3`**.
- Compte rendu Discover : `/private/tmp/discover-mymind-codex-v9-7-main`, branche `codex/v9-7-main`, **créée depuis `main` (`d74af74`)** à la demande de l’utilisateur. Cette base contient V9-1 à V9-5 et V9-8 réalisé par Opus.

Les checkouts principaux restent sur leurs branches initiales. Le code du Worker et d’EnglishPWA ne contient plus de lecture des tables SRT : recherches insensibles à la casse sur `srt_` et le mot `srt` dans les sources et scripts concernés, sans correspondance. Les références historiques dans les anciennes migrations et les tests de non-régression sont conservées.

L’ancienne branche de compte rendu `codex/v9-7` n’est plus la base de la livraison Discover. Seul ce compte rendu est repris sur le nouveau `main` : aucun changement V9-8 n’est refait ni remplacé. Le travail YouTube non commité du checkout principal reste hors de ce lot.

Dans le dépôt distinct EnglishFluency Worker, `main` (`481da09`) est un ancêtre ancien de la base active `feat/lot1` (`fe7b733`) et ne contient pas le schéma actuel. Le commit de migration `6885aa3`, seul écart préparé par rapport à cette base, a été déployé puis intégré par avance rapide dans **`feat/lot1`**, après contrôle de son statut propre. Aucun nom de branche n’a été changé et l’Atelier n’a pas été modifié.

## Changements

- Déplacement **sans modification du SQL** de `migrations-en-attente/0018_remove_srt_library.sql` vers `migrations/0021_remove_srt_library.sql`. Aucun historique existant n’est renuméroté : 0018 à 0020 restent réservés/utilisés conformément au brief.
- Retrait du README d’attente obsolète et du dossier `migrations-en-attente/` devenu vide.
- Rétablissement dans `test/securite.test.ts` de l’assertion d’absence de toute table dont le nom commence littéralement par `srt_` (`GLOB 'srt_*'`). Le test des anciennes routes retournant 404 est conservé.
- Ajout de `test/migration-srt.test.ts` : schéma antérieur réel, données dans les quatre tables, clés étrangères activées, conservation des autres tables et des marqueurs de purge sémantique, absence de violation de clés étrangères et rejeu quand les tables sont absentes.

Migration appliquée :

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

Suites complètes relancées après reprise depuis le nouveau `main` : **1 183 tests passent** (1 182 lors de la préparation initiale, plus le test ajouté dans la base V9-8).

- Worker EnglishFluency : **226 tests / 18 fichiers**, `npx tsc --noEmit -p .` réussi.
- PWA Discover : **219 tests / 40 fichiers**, TypeScript et build réussis.
- Worker Discover : 345 tests / 31 fichiers, TypeScript réussi.
- Atelier : 303 tests, contrats du worktree V9-7 et configuration factice du worktree Atelier V9-5 conservé.
- EnglishPWA : 90 tests / 15 fichiers, TypeScript, lint et build réussis.

Les tests automatisés appliquent les migrations sur SQLite en mémoire. Le SQL déplacé est identique octet pour octet à l’original (SHA-256 `cb042864b5236b0aa16771ad7d66c7332d612e71d589a13549277de4bfb3390e`). Les avertissements existants de taille de bundle, lecture de corps audio dans un test et SQLite expérimental ne constituent pas des échecs.

## Procédure de production autorisée et suivie

Lot exécuté : migration **0021**, suppression des quatre tables et des données SRT, puis déploiement du Worker depuis le commit validé `6885aa3`. Aucun fichier source actif du Worker n’a changé dans ce lot. Aucun déploiement EnglishPWA ni Discover n’a été effectué.

Risques : perte des données des quatre tables sans restauration depuis sauvegarde ; les anciens vecteurs restent stockés jusqu’à leur purge normale par l’indexeur, tout en étant masqués en recherche par le code existant. Cette purge distante n’est pas déclenchée par les tests.

Après accord explicite sur V9-7, les étapes du § 6 ont été suivies depuis le worktree Worker avec **Wrangler local 4.95.0**, sans mise à jour de dépendance :

1. Vérifier l’historique réel avec `npx wrangler d1 migrations list englishfluency --remote`. Confirmer que 0021 est bien la seule migration nouvelle à appliquer ; suspendre si l’état distant diffère du brief.
2. Capturer le point Time Travel avec `npx wrangler d1 time-travel info englishfluency` et consigner le bookmark dans `discover-backups/ef-time-travel-bookmark-avant-0021.txt`.
3. Lister les tables distantes puis exporter **table par table**, en excluant les tables internes (`sqlite_*`, `_cf_*`), les tables virtuelles et leurs tables de stockage FTS (`%_fts%` et tables auxiliaires associées). Conserver impérativement les quatre tables SRT et `semantic_index`. Construire les options `--table` dans un tableau zsh ; écrire l’export dans `discover-backups/ef-d1-avant-0021-<date>.sql`. Vérifier la présence des quatre tables dans l’export et consigner les résultats avant d’appliquer la migration.
4. Exécuter `npx wrangler d1 migrations apply englishfluency --remote`, puis vérifier l’historique, l’absence de toute table `srt_*` et la conservation des tables hors SRT.
5. Déployer le Worker avec `npm run deploy`, vérifier sa santé et le maintien des anciennes routes SRT à 404 ; vérifications en lecture seulement, aucun appel payant pour la recette.

Le chemin de sauvegarde est le dossier partagé `/Users/brice/mesProjects/myMobileProjects/discover-backups/`, pas un dossier relatif au worktree dans `/private/tmp`. Ne pas lancer d’export complet D1 : les tables FTS5 peuvent le faire échouer. Ne pas considérer un bookmark seul comme le remplacement de l’export demandé par le brief.

En cas d’échec, conserver export, bookmark et diagnostics ; aucune restauration automatique de la base entière ne sera lancée, car elle pourrait affecter d’autres écritures. Une restauration doit être préparée et validée à partir de la sauvegarde.

## Suite

**V9-7 est terminé et vérifié en production**, commit Worker `6885aa3`, version `8864006d-5951-4683-9324-2a3ae9193fd7`. **V9-8 est fait par Opus et présent dans `main`** ; aucune intervention sur cette interface n’est requise pour V9-7.

La branche Discover de livraison est désormais `codex/v9-7-main`, dont le seul changement par rapport au commit de base `main` (`d74af74`) est ce compte rendu. Les changements YouTube non commités ne sont ni repris dans le worktree ni modifiés par ce lot. Les anciennes branches et leurs commits sont conservés pour traçabilité.

## Preuves de sauvegarde et de recette

Cible vérifiée : compte Cloudflare `817dc5b2b02a8866edbb04842f84f849`, Worker `englishfluency-worker`, base `englishfluency` (`304a84c8-49c9-446b-b7ce-be18a3765bce`). L’identité OAuth et les permissions D1/Workers en écriture ont été contrôlées sans afficher de jeton.

- Bookmark : `00000300-00000000-0000510a-5cfc31e54a2749dadf8cd4db1b9a4e08`, consigné dans `/Users/brice/mesProjects/myMobileProjects/discover-backups/ef-time-travel-bookmark-avant-0021.txt`.
- Export : `/Users/brice/mesProjects/myMobileProjects/discover-backups/ef-d1-avant-0021-20261020.sql`, **21 826 739 octets**, mode privé 0600.
- SHA-256 : `74b14e6a45b3eadf94b4294e123806065a591df655e38ec1e84195ac617105d0`.
- **32 tables exportées** avec des options `--table` construites dans un tableau zsh. Le schéma distant ne contient actuellement aucune table virtuelle/FTS ; seules `_cf_KV` et `sqlite_sequence` ont été exclues selon la règle des tables internes.
- Export restauré sur une base locale privée de vérification, avec `integrity_check = ok`, aucune violation de clés étrangères et égalité des comptages pour les 32 tables, avant toute suppression distante.
- Manifeste de validation : `discover-backups/ef-d1-avant-0021-20261020.validation.json`. Diagnostics privés et preuves : `discover-backups/ef-v9-7-production-20261020/`. Aucun secret, contenu exporté ni URL temporaire de téléchargement n’est commité.

Comptages des tables retirées, présents et vérifiés dans la sauvegarde :

| Table | Lignes avant | État après |
| --- | ---: | --- |
| `srt_sources` | 1 | absente |
| `srt_episodes` | 10 | absente |
| `srt_scenes` | 409 | absente |
| `srt_scene_questions` | 354 | absente |

Après migration : schéma identique pour toutes les tables conservées ; tous leurs comptages sont identiques, sauf `d1_migrations` qui passe de 19 à 20 lignes. `migrations list --remote` répond « No migrations to apply! ».

Déploiement : `npm run deploy` réussi après un `wrangler deploy --dry-run` réussi. Ancienne version `4487749a-11da-4d97-b6db-83df62c4c96c`, nouvelle version `8864006d-5951-4683-9324-2a3ae9193fd7`. Le déploiement `2da8401a-abcc-48f0-bcfc-856a05345001` du 20 octobre 2026 à 08 h 14 (Europe/Paris) reçoit **100 % du trafic**, vérifié par `deployments list --json`. Les bindings, références de secrets et options runtime ont été comparés avant/après et sont identiques.

Recette avec `curl` sur `https://englishfluency-worker.bricebrain.workers.dev` :

| Requête GET | Authentification | Résultat |
| --- | --- | ---: |
| `/` | publique | 200, santé `ok` |
| `/words/count` | absente | 401 |
| `/words/count` | clé de l’intégration existante | 200 |
| `/srt/sources` | clé de l’intégration existante | 404 |
| `/srt/import-folder` | clé de l’intégration existante | 404 |

Les contrôles authentifiés utilisent la configuration d’import existante, clé transmise par stdin et jamais affichée. La clé de développement locale n’a pas été modifiée. Le client Python par défaut a rencontré le filtrage Cloudflare 1010 ; la recette finale avec le client `curl` est réussie. Le premier comptage composé avait aussi rencontré une limite D1 ; il a été remplacé par des SELECT séparés, sans écriture de données.

Références vérifiées : [commandes D1](https://developers.cloudflare.com/d1/wrangler-commands/) et [permissions Cloudflare](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), avec validation de la syntaxe par l’aide de la version locale de Wrangler.
