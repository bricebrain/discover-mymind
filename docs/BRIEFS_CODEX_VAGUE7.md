# Brief Codex — vague 7 : articles d'Explorer comme sources de dossier (19 octobre 2026)

Rédigé par Claude Opus. Chantier **D2**, indépendant de R (vague 6) : il peut tourner en parallèle, dans ses propres worktrees.
En face, Opus fait l'interface : **mode sélection** dans Explorer et la Bibliothèque (appui long, plusieurs cartes cochées,
« Créer un dossier »), qui utilisera ton contrat.

Lire d'abord : `docs/BRIEFS_CODEX_VAGUE2.md` (règles communes), `docs/DOSSIERS_A.md`, `docs/CODEX_A5.md`,
`worker/src/dossiers/{candidates,routes,sources}.ts`, `worker/src/articles/`, `worker/migrations/0013*.sql` et `0018_articles.sql`,
`convert/discover_dossier.py`, `convert/discover_source.py`, `convert/discover_articles.py`.

## Objectif utilisateur

Depuis le téléphone, mettre directement dans un dossier des **articles d'Explorer** (The Guardian, The Conversation US et France,
ProPublica), mêlés à des épisodes, des vidéos et des notes, pour obtenir un condensé préparé par l'Atelier sur le Mac.
Aujourd'hui, un article doit d'abord devenir une note My Mind « Article ».

## À livrer

### Worker Discover

- Nouveau type de source de dossier **`article`** (en plus de `episode`, `content`, `reflection`) : validation, déduplication,
  titres (`routes.ts`), capture figée au lancement (`sources.ts`), avec éditeur, langue, URL d'origine et date de publication.
- **Candidats** (`GET /api/dossier-sources`) : inclure les articles, libellé `Article · <journal>`. Un article déjà transformé en note
  (`reflection_id`) ne doit pas apparaître deux fois : proposer l'un ou l'autre, et le documenter.
- **Texte de l'article** : au lancement de la préparation, le texte capturé est le texte complet s'il est disponible
  (`content_status = complete`). S'il ne l'est pas (`none`, `feed`, `partial`, `pending`), utiliser la file existante de
  récupération par l'Atelier (`/atelier/article-texts`) : la demande de dossier attend ce texte, ou l'Atelier le récupère avant de
  préparer ; si l'article est `unavailable`, refuser le lancement avec un message clair (422) plutôt que préparer un résumé tronqué.
  Proposer le circuit retenu dans le résumé **avant de coder**.
- Une route de création accepte déjà une liste de références : vérifier qu'elle convient au futur mode sélection
  (création en un appel avec 2 à 6 références, titre facultatif et titre par défaut). Sinon, l'adapter et documenter le contrat.
- Migration **0025** seulement si un CHECK ou une colonne doit changer (0024 est réservée à R).
- Suppressions : un article supprimé de la base devient « Source indisponible » dans le dossier, comme les autres types.

### Atelier

- `discover_dossier.py` / `discover_source.py` : préparer une source `article` à partir du texte capturé (découpage en
  paragraphes existant de `discover_articles.py`), attribution « (article, <journal>) » dans les consignes et la synthèse, comme les
  notes Article ; aucune récupération de page en contournant un paywall, aucun cookie de l'utilisateur.
- Le quiz, les coûts et la provenance (`sourceSegments`) fonctionnent comme pour les autres types.

### PWA (exception limitée)

- Tu peux modifier **uniquement les types** : `pwa/src/api/dossiers.ts` (`DossierSourceType`) et `DossierSource` dans
  `pwa/src/api/contents.ts`, pour ajouter `'article'`, ainsi que les libellés de type dans `pwa/src/dossiers/DossiersPanel.tsx`
  (`SOURCE_TYPES`) et le lien vers un article dans `pwa/src/dossiers/SegmentSources.tsx` (`sourceLink` : `/?a=<id>`).
  Rien d'autre dans `pwa/` : le mode sélection est fait par Opus.

## Acceptation

- Worker : tests de validation, candidats (sans doublon article/note), capture figée, texte incomplet → circuit choisi,
  `unavailable` → 422, suppression → source indisponible ; `npm test` et typecheck verts.
- Atelier : test de bout en bout simulé d'un dossier contenant au moins un article d'Explorer et un épisode (dans la lignée de
  `tests/test_discover_dossier_e2e.py`) ; `python3 -m unittest discover -s tests -q` vert.
- PWA : `npm test`, `npx tsc --noEmit -p .`, `npm run build` verts.
- `docs/CODEX_D2.md` : contrat exact (création, candidats, capture, états du texte) pour Opus.
- Aucun déploiement, aucune migration en production, aucun appel payant réel.
