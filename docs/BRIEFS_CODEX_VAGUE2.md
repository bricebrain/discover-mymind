# Briefs Codex — vague 2 (19 octobre 2026)

Rédigés par Claude Opus. Contexte : Claude Opus **refait toute l'interface de la PWA** (Tailwind CSS + shadcn/ui + Motion,
écran par écran, MUI retiré à la fin). Pendant ce temps, **Codex ne modifie rien dans `discover-mymind/pwa/`**. Les trois
chantiers ci-dessous sont côté Worker, Atelier ou étude, indépendants entre eux.

Lire d'abord : `docs/PLAN_PARTAGE_CODEX_OPUS.md` (§§ 6, 9, 10), `docs/BRIEFS_GLM.md` (règles communes, toujours valables),
`docs/PHASE0_ARCHITECTURE.md`, puis le code concerné.

## Règles communes

1. Un worktree par chantier, jamais dans `discover-mymind/` lui-même :
   `git -C discover-mymind worktree add -b codex/<chantier> ../discover-mymind-codex-<chantier> main`.
   Dans `convert/`, branche `codex/<chantier>` **dans un worktree** aussi : `git -C convert worktree add -b codex/<chantier> ../convert-codex-<chantier> feat/lot1`
   (ne jamais changer la branche de `convert/` : l'Atelier y tourne, et le travail vocabulaire non commité de l'utilisateur y vit).
2. **Interdit** : `discover-mymind/pwa/**` (refonte en cours), déploiement, migration en production, appel payant réel,
   `git add .` / `-A` / `reset` / `stash` / nettoyage global, fichiers du travail vocabulaire de `convert/`
   (`interface.html`, `convertisseur_web.py`, `bundles.py`, `vocabulaire*`, `README.md`, `.gitignore`).
3. Migrations : 0016 reste réservée à l'ancien brief E (non utilisée). Ce lot utilise **0019** (C) si nécessaire. Toute autre : demander.
4. Tests verts avant de rendre (`npm test` + `npx tsc --noEmit -p .` dans `worker/` ; `python3 -m unittest discover -s tests -q`
   dans `convert/`). Commits ciblés en français, fin : `Co-Authored-By: Codex`. Résumé dans `docs/CODEX_<CHANTIER>.md`.
5. Annoncer découpage et fichiers avant de coder. Ne pas commencer un autre chantier.

---

## Brief A2 — C côté serveur : My Mind complet (API uniquement)

L'interface sera faite par Opus dans la nouvelle UI ; Codex livre l'API, testée, et sa documentation.

- **Recherche plein texte serveur** : la table FTS5 `search_index` existe (migrations) mais n'est pas alimentée de façon fiable.
  Indexer titre + corps des notes (création, modification, corbeille, restauration, purge, notes créées depuis un article ou par
  la récupération Atelier), `GET /api/reflections/search?q=&cursor=` paginé, extraits surlignés, notes en corbeille exclues.
  Ajouter si utile les articles d'Explorer (titre + texte) dans un index séparé ou un type distinct — à proposer.
- **Types, étiquettes, état des questions** : `kind` (idea|question|opinion|observation|synthesis) et `tags` existent ;
  `question_state` (to_explore|thinking|deepened) n'est pas modifiable par l'API : l'ajouter au PATCH, avec validation ;
  filtres serveur `?kind=`, `?tag=`, `?origin=personal|article`, `?question_state=` sur la liste.
- **Liens multiples et citations** : vérifier que création/modification de plusieurs liens (épisode, contenu, passage, citation)
  fonctionne, que la cible existe, et qu'un conflit 409 ne modifie jamais les liens. Tests dédiés.
- Ne rien casser : brouillons hors ligne, contrôle de conflit (`baseUpdatedAt`), préparation en anglais d'une note, notes Article
  (`origin`, `source_name`, `source_url`, `article_fetch`).
- Fichiers : `worker/src/routes/reflections.ts` (ou un module `worker/src/mind/`), migration 0019 si nécessaire, tests.
- Acceptation : recherche du corps complet paginée, index cohérent après chaque opération (test), filtres, `question_state` modifiable.

## Brief D0 — Étude : préparer sans le Mac

Étude écrite **sans code de production** : `docs/CODEX_D_ETUDE.md`.

- Objectif utilisateur : lancer une préparation depuis le téléphone quand le Mac est éteint.
- Décisions déjà prises : **pas de Workers AI** ; voix **Deepgram** (API directe), avec estimation avant génération et plafond
  cloud distinct du budget local de l'Atelier ; jamais une préparation longue dans une simple requête Worker.
- À établir, source par source (podcast avec/sans transcription, YouTube, note/article texte, dossier) : acquisition possible
  hors Mac ? transcription (fournisseur, coût, durée) ? Ce qui est réellement faisable aujourd'hui, sans promesse universelle.
- Infrastructure candidate (Cloudflare Workflows/Queues/Containers, autre) : limites de durée et de mémoire, coûts, secrets.
- Exclusion mutuelle Mac/cloud sur une même demande (bail existant), reprise, double facturation évitée, budgets explicites.
- Livrable : options chiffrées, recommandation, contrat proposé (file, bail, publication) et découpage en étapes.

## Brief F — Pont EnglishFluency

- Option dans l'Atelier, pour une préparation Discover publiée : « aussi vers EnglishFluency ».
- Étudier d'abord le contrat réel : `englishfluency-worker/`, `englishfluency-app/`, `englishPwa/`, et la publication existante de
  l'Atelier vers EnglishFluency (`convert/bundles.py`, `convert/convertisseur_web.py` — **lecture seule** : fichiers du travail
  personnel de l'utilisateur ; s'ils doivent changer, le proposer dans le résumé au lieu de les modifier).
- Correspondance des formats (texte anglais, traduction, audio, vocabulaire clé), envois indépendants Discover / EnglishFluency,
  idempotence et reprise d'un échec partiel ; aucun envoi réel pendant les tests.
- Fichiers : nouveau module `convert/discover_englishfluency.py`, point d'intégration minimal dans `discover_preparation.py`,
  réglage dans `config_discover.example.json`, tests `tests/test_discover_englishfluency.py`.
- Acceptation : une préparation simulée produit le paquet EnglishFluency attendu, une seconde exécution ne duplique rien,
  un échec côté EnglishFluency n'empêche pas la publication Discover.
