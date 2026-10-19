# Brief V — Vocabulaire enrichi EnglishPWA et retrait SRT

Livraison du 19 octobre 2026. Périmètre : brief V de `BRIEFS_CODEX_VAGUE4.md`, spécification `convert/CAHIER_MODIFICATIONS_ENGLISHPWA_VOCABULAIRE.md`, et retrait du code SRT PWA demandé après le commit Worker `ecd2c9c`.

## Isolation et état de départ

Chaque dépôt utilise un worktree sur la branche `codex/vocabulaire-v` :

- EnglishPWA : `/private/tmp/englishPwa-codex-v`, base `a84268e` (`feat/lot1`).
- EnglishFluency Worker : `/private/tmp/englishfluency-worker-codex-v`, base `ecd2c9c` (`feat/lot1`).
- Discover, compte rendu uniquement : `/private/tmp/discover-mymind-codex-v`, base `6e5f385` (`main`).

Les checkouts principaux sont préservés, y compris `englishPwa/tts-samples/`. Aucun changement dans `convert/`, `discover-mymind/pwa/`, les secrets ou la production. Dépendances existantes copiées dans les worktrees, aucune nouvelle dépendance ajoutée.

## État constaté et changements

Une grande partie de la spécification était déjà implémentée : jointures des routes SRS et Lingvist, mapper public sans audit, types et helpers PWA, détails MUI après réponse, exemples enrichis pour les variantes, traduction des cartes historiques corrigée, mocks enrichis et tests de contrat. Ces éléments sont conservés et vérifiés, sans réimplémentation.

### Worker

- `src/vocabulary.ts` : `GET /words` et `GET /words/:id` joignent désormais l’enrichissement publié par un `LEFT JOIN`, sans requête par mot. Les champs historiques et identifiants restent inchangés ; les colonnes techniques et champs d’audit ne sortent pas dans l’enrichissement public.
- `src/lingvistSession.ts` : associe la version d’enrichissement à la préparation d’une carte ; expose `enrichmentVersion` dans la session. Une ancienne carte conserve sa version de préparation, même après une nouvelle publication. La correction immédiate de `wordTraductionFr` dans la réponse reste active.
- `src/lingvist.ts` : un import externe remet la version à `NULL`, car la version effectivement utilisée par l’importateur n’est pas connue.
- `src/nightlyAi.ts` : la régénération existante enregistre la version de l’enrichissement réellement fourni au modèle. Aucun nouveau déclenchement ou appel IA ajouté.
- `test/vocabularyEnrichmentJoin.test.ts` : lecture publique, publication successive, conservation des cartes valides et d’une progression non vide, « Je connais », versions de préparation, import externe et régénération entièrement simulée.

Les routes `/words/sync`, `/words/random` et `/words/grammar-seed`, non demandées par le contrat § 3.2, conservent leur comportement.

### EnglishPWA

- `src/types/vocabulary.ts` : catégorie grammaticale libre (`string`), conformément au contrat de l’atelier.
- `src/helpers/vocabularyDisplay.ts` et son test : catégories libres avec libellés lisibles, nettoyage des champs des sens et collocations mal formés, repli de la réponse française si la traduction publiée est générique, reconnaissance des catégories modales sans confondre leurs homographes lexicaux. `displayForm` reste une forme d’affichage ; la réponse anglaise utilise le lemme, après retrait contrôlé de `to`.
- `src/hooks/useFlashcardSession.ts` : la réponse attendue FR→EN est le lemme. L’affichage EN reste `displayForm`, la prononciation reste le lemme, la sauvegarde garde l’identifiant historique.
- `src/pages/FlashcardsPage.tsx` et son nouveau test : le contenu du verso n’est rendu qu’après révélation, y compris pour les lecteurs d’écran. Les détails restent après la réponse.
- `src/api/learningApi.contract.test.ts` : vérifie aussi le maintien d’une réponse Lingvist conjuguée (`ranges`) et le payload du tri fondé sur les identifiants historiques.

Les clés React Query existantes sont conservées. SRS et tri restent immédiatement périmés selon la configuration actuelle ; Lingvist garde cinq minutes. Les refetch existants sont conservés, sans purge globale du cache.

### Suppression SRT

- Suppression de `src/components/reading/SrtLibraryPanel.tsx`.
- Retrait des méthodes SRT de `src/api/learningApi.ts`, hooks de `src/hooks/useReadingLibrary.ts`, modèles de `src/types/reading.ts` et mocks de `src/mocks/readingData.ts`.
- `src/pages/ReadingPage.tsx` conserve les articles guidés, leurs filtres et leur détail, sans onglet SRT.
- `src/types/aiFeatures.ts`, `src/helpers/passageSources.ts`, `src/mocks/aiFeaturesData.ts` et `src/pages/SearchPage.tsx` retirent la source et le filtre SRT.
- `src/pages/HomePage.tsx` et `src/pages/MorePage.tsx` proposent uniquement les articles dans leurs libellés de lecture.
- Recherche `rg -n 'Srt|srt|SRT' src` : aucune occurrence restante.

## Migration réservée : EnglishFluency 0019

`migrations/0019_lingvist_enrichment_version.sql` ajoute une colonne nullable `lingvist_cards.enrichment_version`. Aucune suppression, aucun backfill et aucune remise à zéro de `word_progress`.

- `NULL` : version inconnue (cartes historiques, préparation sans enrichissement ou import externe).
- Entier : version effectivement utilisée lors de la préparation ou régénération.
- Une publication ne provoque pas de reconstruction des cartes valides. La réparation préexistante des cartes invalides reste inchangée.

**0019 est consommée par V ; I1 doit utiliser 0020 s’il a besoin d’une migration.** Vérifier les branches concurrentes avant intégration. Aucune migration de production appliquée par ce chantier.

## Validation

EnglishPWA :

- `npm test` : **86 tests, 14 fichiers**, réussis.
- `npm run lint` : réussi.
- `npm run build` : TypeScript (`tsc -b`) et Vite réussis.
- `git diff --check` : réussi.

Worker :

- `npm test` : **217 tests, 16 fichiers**, réussis.
- `npx tsc --noEmit -p .` : réussi.
- `git diff --check` : réussi.
- Les tests appliquent les migrations dans SQLite en mémoire et simulent les fournisseurs ; aucun appel payant réel.

Recette navigateur locale, données de démonstration, aucun backend de production :

- EN→FR : `to range`, traduction corrigée acceptée, sens et collocations après validation.
- FR→EN : traduction corrigée en face avant, `range` accepté et affiché comme réponse sans `to`.
- Modal : `can` accepté, affiché sans `to`.
- Avant révélation : ni réponse, ni exemple, ni expressions dans l’arbre d’accessibilité après la correction du verso.
- Lecture : articles et filtres présents, aucun onglet SRT.

Les cartes Lingvist historiques, mots non enrichis, modaux, formes conjuguées, progression et tri sont couverts par les tests automatisés. La production et le Fold7 physique restent à recetter après intégration autorisée.

## Intégration

1. Relire et intégrer les commits de la branche `codex/vocabulaire-v` dans chaque dépôt (voir ci-dessous).
2. Vérifier que 0018 a bien été appliquée dans l’environnement cible et qu’aucune migration concurrente ne porte le numéro 0019.
3. Appliquer 0019 avant de servir le nouveau Worker, puis déployer Worker et PWA selon le processus de l’intégrateur, après autorisation. Ces actions n’ont pas été effectuées ici.
4. Recharger la PWA ou utiliser le refetch existant ; vérifier un mot enrichi et un mot historique avec la progression réelle conservée.

Commits :

- EnglishPWA : `32167a0` — Finaliser le vocabulaire enrichi et retirer la bibliothèque SRT.
- Worker : `2808d64` — Compléter le contrat public du vocabulaire enrichi.
- Discover : le commit contenant ce document.
