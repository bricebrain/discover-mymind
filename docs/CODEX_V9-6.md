# V9-6 — Ménage des worktrees

## Périmètre et contrôles

Inventaire initial du 20 octobre 2026 : **49 worktrees** (38 Discover, 11 Atelier), dont les deux checkouts principaux. Worktree du chantier créé ensuite : `/private/tmp/discover-mymind-codex-v9-6`, branche `codex/v9-6`, depuis `codex/v9-5` (`1ac8e40`).

Le nouveau commit de `main` (`4045d4a`), qui ajoute V9-8 au brief, est intégré dans cette branche de travail. Aucun changement de code applicatif dans ce lot.

Pour chaque suppression : branche présente dans `git branch --merged` sur la branche de référence (`main` pour Discover, `feat/lot1` pour Atelier), contrôle supplémentaire `merge-base --is-ancestor`, HEAD inchangé, statut vide avec tous les fichiers non suivis, absence de verrou de worktree, absence de processus utilisant le chemin et de lien `node_modules` à la racine des projets conservés pointant vers ce worktree. Ces contrôles ont été refaits juste avant la suppression.

Opérations ciblées : `git worktree remove <chemin>`, sans option de force, puis `git branch -d <branche>`. Aucun reset, stash, nettoyage global ni changement de branche dans les checkouts principaux.

## Sauvegarde des fichiers ignorés utiles

Avant suppression, les configurations privées et états locaux Wrangler de sept worktrees ont été archivés dans :

`/Users/brice/mesProjects/myMobileProjects/discover-backups/worktrees-v9-6-20261020/`

Archives privées (mode 0600), dossier mode 0700. Les archives ont été relues, leur SHA-256 vérifié et leur contenu comparé aux fichiers originaux avant retrait du worktree. `inventaire.json` contient les chemins, branches, commits, fichiers ignorés et empreintes des archives. Les sauvegardes préexistantes n’ont pas été modifiées ni supprimées.

Les dépendances réinstallables (`node_modules`), builds (`dist`), caches Python et déclarations Worker générées ne sont pas archivés. Les dépendances utilisées par les worktrees conservés restent disponibles.

## Worktrees candidats

| Dépôt | Chemin | Branche | Commit |
| --- | --- | --- | --- |
| Discover | `/private/tmp/discover-mymind-codex-d2` | `codex/d2` | `3909055` |
| Discover | `/private/tmp/discover-mymind-codex-l5` | `codex/l5-level-suggestion` | `a75c54a` |
| Discover | `/private/tmp/discover-mymind-codex-q` | `codex/q-quiz` | `7a1e8a0` |
| Discover | `/private/tmp/discover-mymind-codex-r` | `codex/r-related` | `ed2f54b` |
| Discover | `/private/tmp/discover-mymind-codex-v` | `codex/vocabulaire-v` | `f5c6abb` |
| Discover | `/Users/brice/.codex/worktrees/weekly-c5/discover-mymind` | `codex/weekly-c5` | `d5864ba` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-a` | `opus/dossiers-a` | `02bdad0` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-article` | `opus/article` | `d7afa03` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-articles` | `opus/articles` | `7c3ef4f` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-auto` | `opus/auto-prepare` | `dc9c49c` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-codex-a2` | `codex/a2-my-mind` | `9e02fa1` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-codex-d0` | `codex/d0-etude` | `18d60b1` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-codex-n` | `codex/n-i7` | `593012a` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-codex-weekly-i8` | `codex/weekly-i8` | `ae3b8c3` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-explorer` | `opus/ui-explorer` | `70eb06e` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-fetch` | `opus/article-fetch` | `37ccb4d` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-final` | `opus/ui-final` | `5d7e58f` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-glm-e` | `glm/e-export` | `4468567` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-glm-ecoute` | `glm/i3-i5-ecoute` | `4859944` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-int` | `opus/int-a2` | `3d433aa` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-int5` | `opus/int-vague5` | `55d5572` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-intd2` | `opus/int-d2` | `6b15f73` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-library` | `opus/ui-library` | `3bf979c` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-mind` | `opus/ui-mind` | `99f7956` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-opus` | `opus/offline-b` | `a969f3f` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-player` | `opus/ui-player` | `668046e` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-share` | `opus/mind-share` | `a0ec30b` |
| Discover | `/Users/brice/mesProjects/myMobileProjects/discover-mymind-ui` | `opus/ui-shadcn` | `ae76f95` |
| Atelier | `/private/tmp/convert-codex-a5` | `codex/a5-quiz-dossier` | `37a2f34` |
| Atelier | `/private/tmp/convert-codex-d2` | `codex/d2` | `080e190` |
| Atelier | `/private/tmp/convert-codex-i1` | `codex/i1-vocabulary` | `4421b81` |
| Atelier | `/private/tmp/convert-codex-q` | `codex/q-quiz` | `e9b117f` |
| Atelier | `/private/tmp/convert-codex-r` | `codex/r-related` | `e7f9fdc` |
| Atelier | `/private/tmp/convert-dossiers` | `codex/dossiers-multisources` | `0d80d41` |
| Atelier | `/Users/brice/mesProjects/myMobileProjects/convert-codex-f` | `codex/f-englishfluency` | `cb25763` |
| Atelier | `/Users/brice/mesProjects/myMobileProjects/convert-opus` | `opus/article` | `ec8b56f` |

## Worktrees fusionnés conservés : statut non propre

| Chemin | Motif |
| --- | --- |
| `/private/tmp/discover-mymind-codex-i1` | `worker/node_modules` non suivi ; aucune suppression ni modification de ce lien |
| `/Users/brice/.codex/worktrees/dossiers-multisources/discover-mymind` | 8 fichiers suivis modifiés et 7 entrées non suivies ; travail non commité conservé |
| `/Users/brice/mesProjects/myMobileProjects/discover-mymind-int3` | `worker/node_modules` non suivi ; aucune suppression ni modification de ce lien |
| `/Users/brice/mesProjects/myMobileProjects/discover-mymind-intr` | `worker/node_modules` non suivi ; aucune suppression ni modification de ce lien |

Ils ne remplissent pas le critère du brief « aucune modification non commitée » : ils restent intacts, avec leurs branches. Leur suppression n’a pas été forcée.

## Lots non fusionnés conservés

Discover : `codex/v9-1`, `codex/v9-2`, `codex/v9-3`, `codex/v9-4`, `codex/v9-5`, plus le worktree courant V9-6. Atelier : `codex/v9-3` et `codex/v9-5`. Les deux checkouts principaux sont conservés. Aucun lot non fusionné n’est supprimé, même s’il figure déjà dans une branche V9 plus récente.

## Restauration possible

Le code des branches retirées reste accessible par son commit dans la branche principale où il était fusionné. Pour restaurer un worktree, utiliser le commit de la table et une nouvelle branche `codex/restauration-...`, puis, si nécessaire, extraire l’archive locale correspondante dans le nouveau worktree. Ne pas extraire une configuration privée dans un dépôt partagé ni la commiter.

## Validation

Les suites obligatoires ont été exécutées dans V9-6 (Discover), le worktree Atelier V9-5 conservé et les deux dépôts EnglishFluency concernés. Résultats : **1 179 tests passent** (218 PWA Discover, 345 Worker Discover, 303 Atelier, 223 Worker EnglishFluency, 90 EnglishPWA). TypeScript, lint et builds requis réussis. Aucun test nouveau pour ce ménage de fichiers.

## Résultat final

**36 worktrees et leurs 36 branches fusionnées supprimés : 28 Discover et 8 Atelier.** Inventaire final : **15 worktrees** (12 Discover, dont le nouveau V9-6 ; 3 Atelier). Un worktree supplémentaire `/Users/brice/mesProjects/myMobileProjects/discover-mymind-vivant`, branche `opus/v9-8`, a été créé par ailleurs pendant le ménage : il est conservé et n’a pas été modifié par ce lot.

Les chemins et références supprimés sont absents ; les commits retirés restent accessibles dans leurs branches de référence. Les deux checkouts principaux conservent exactement leurs branches et HEAD initiaux : Discover `main` à `4045d4a`, Atelier `feat/lot1` à `b5e68b0`. Leurs statuts restent propres. Les quatre statuts non propres conservés sont identiques à ceux de l’inventaire initial. Les lots V9-1 à V9-5 Discover et V9-3/V9-5 Atelier sont toujours présents.

Le journal `suppressions.json` et l’inventaire final sont conservés avec les archives locales ; aucune configuration privée n’est ajoutée au dépôt. Aucun échec de suppression ni aucune branche résiduelle pour les 36 candidats.

Aucun déploiement, aucune migration, aucun appel payant, aucune modification de configuration ni redémarrage de l’Atelier dans ce lot. Le chantier V9-7 n’est pas commencé.
