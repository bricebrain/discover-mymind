# Briefs Codex — vague 4 (19 octobre 2026)

Rédigés par Claude Opus. Opus relit et intègre la vague 3 (Q, N, W) et termine la refonte de la PWA Discover (étape 7).
**Codex ne modifie toujours rien dans `discover-mymind/pwa/`.** Deux chantiers indépendants, un worktree chacun.

Lire d'abord : `docs/BRIEFS_CODEX_VAGUE2.md` (règles communes, **toujours valables**), `docs/PLAN_PARTAGE_CODEX_OPUS.md` (§§ 9 à 11).

## Rappels propres à cette vague

- Le travail vocabulaire de l'utilisateur est maintenant **commité** dans `convert/` (`28faed4`, branche `feat/lot1`) : il n'est
  plus interdit en lecture, mais toute modification de `vocabulaire*.py`, `convertisseur_web.py` ou `bundles.py` reste minimale
  et justifiée dans le résumé.
- `englishfluency-worker/` contient du **travail non commité qui n'est pas le tien** (suppression de la bibliothèque SRT,
  migration `0018_remove_srt_library.sql` non appliquée) : worktree obligatoire
  (`git -C englishfluency-worker worktree add -b codex/<chantier> ../englishfluency-worker-codex-<chantier> feat/lot1`),
  ne jamais toucher à ces fichiers dans le dossier principal. Même règle pour `englishPwa/` (dossier `tts-samples/` non suivi).
- Migrations réservées : Discover **0023** (I1). EnglishFluency **0019** si nécessaire (V ou I1, le premier qui en a besoin le
  signale dans son résumé ; l'autre prend 0020).
- Aucun déploiement, aucune migration en production, aucun secret créé ou modifié en production : documenter ce qu'il faudra faire.

---

## Brief V — Vocabulaire enrichi dans EnglishPWA

Mettre en œuvre `convert/CAHIER_MODIFICATIONS_ENGLISHPWA_VOCABULAIRE.md`, qui est la spécification complète (contrat § 3,
fichiers § 5, tests § 6, ordre § 7, critères § 8, hors périmètre § 9).

- Vérifier d'abord ce qui existe déjà côté `englishfluency-worker` (`src/vocabulary.ts`, `src/vocabularyEnrichment.ts`,
  `src/vocabularyEnrichmentMapper.ts`, migration 0016 appliquée en production) et ne compléter que l'écart avec le § 3
  (enrichissement joint aux routes métier du § 3.2, cartes Lingvist en cache du § 3.3).
- Puis `englishPwa/` : types, helpers, mapping API, flashcards, Lingvist, tri des mots faciles, rafraîchissement (§ 4).
- Jamais d'appel aux routes `/admin/vocabulary/*` depuis la PWA ; aucune perte de progression (`word_progress`), aucune carte recréée.
- Acceptation : critères du § 8, tests du § 6 verts dans les deux dépôts (`npm test`, typecheck, lint de `englishPwa`).

## Brief I1 — Envoyer un mot de Discover vers EnglishFluency

Objectif utilisateur : pendant la lecture d'une transcription Discover, garder un mot (ou une courte expression) **avec sa phrase**
pour le réviser ensuite dans EnglishFluency.

- **Étudier d'abord** comment EnglishFluency reçoit des mots aujourd'hui (`englishfluency-worker/src/index.ts`, routes `/words`,
  modèle `words` / `word_progress` / `vocabulary_enrichments`) et le pont existant de l'Atelier (`convert/discover_englishfluency.py`,
  `convert/bundles.py`). Proposer dans `docs/CODEX_I1.md`, **avant de coder**, le circuit retenu.
- Circuit recommandé (à confirmer par l'étude) : la PWA Discover enregistre le mot dans le Worker Discover
  (`POST /api/vocabulary/picks` : mot, phrase, contenu, version, `segmentIndex`, langue ; migration 0023 ;
  `GET` liste et `DELETE`), puis **l'Atelier** synchronise ces mots vers EnglishFluency avec ses accès existants (pas de nouveau
  secret entre les deux Workers), de façon idempotente et reprenable, et marque chaque mot « envoyé / déjà connu / échec ».
  Un mot déjà présent dans les 4 000 rattache la phrase comme exemple au lieu de créer un doublon.
- Si EnglishFluency n'a pas de route pour un mot ajouté par l'utilisateur, l'ajouter dans `englishfluency-worker` (worktree,
  migration EF réservée ci-dessus), sans casser le SRS ni les routes existantes.
- Hors périmètre : l'interface Discover (Opus) et la « part de mots connus avant de préparer » (étape suivante, à esquisser
  seulement dans le résumé).
- Acceptation : contrat d'API documenté pour Opus, synchronisation simulée (second passage sans doublon, échec EF sans perte),
  tests verts dans `discover-mymind/worker`, `convert/` et, si modifié, `englishfluency-worker`.
