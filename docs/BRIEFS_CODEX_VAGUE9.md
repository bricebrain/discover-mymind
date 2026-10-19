# Reprise complète par Codex — vague 9 (20 octobre 2026)

Rédigé par Claude Opus. **L'utilisateur confie désormais tout le travail restant à Codex**, y compris les écrans de la PWA
qu'Opus se réservait et l'intégration finale. Ce document remplace les répartitions précédentes : la règle « ne pas toucher aux
fichiers d'Opus » de `BRIEFS_CODEX_VAGUE5.md` et `BRIEFS_CODEX_VAGUE8.md` **ne s'applique plus**. Les autres règles restent.

## 1. État au départ

- **Refonte terminée** (étapes 1 à 7) : toute la PWA est en Tailwind + shadcn/ui + Motion, **MUI est retiré**, thème clair
  uniquement. Discover `main` = `5d7e58f`, Worker en production `c5355374`.
- En production, côté serveur, sans interface encore : quiz (Q), retour de niveau (N), mots vers EnglishFluency (I1),
  rapprochement (R : `/api/related`, `/api/related/groups`), articles comme sources de dossier (D2). « Ma semaine » (C5) et le
  niveau suggéré dans Abonnements (L5) ont déjà leur interface.
- Migrations Discover appliquées en production : jusqu'à **0024**. EnglishFluency : jusqu'à **0020** ; la migration de
  suppression des tables SRT attend dans `englishfluency-worker/migrations-en-attente/` (voir § 5).
- Atelier (`convert/`, branche `feat/lot1`) : tourne sur le Mac, port **53782**, lancé par
  `CONVERTISSEUR_PORT=53782 nohup /Library/Frameworks/Python.framework/Versions/3.15/bin/python3 -u convertisseur_web.py > <journal> 2>&1 &`
  depuis `convert/`. Rapprochement actif (bge-m3 via Ollama, cache `fileToImport/.discover-queue/related.sqlite`).

## 2. Règles (toujours valables)

1. Worktree par chantier ; **ne jamais changer la branche de `convert/`** (l'Atelier y tourne) ; `git add` ciblé, jamais
   `git add .` / `-A`, `reset`, `stash` ni nettoyage global dans `convert/`.
2. Tests verts avant tout commit : `npm test` + `npx tsc --noEmit -p .` (+ `npm run build` pour la PWA) dans `worker/` et `pwa/` ;
   `python3 -m unittest discover -s tests -q` dans `convert/` ; `npm test` dans `englishfluency-worker/`, et
   `npx tsc -b && npm test -- --run && npm run lint && npm run build` dans `englishPwa/`.
3. Interface : Tailwind + shadcn/ui + Motion, composants de `pwa/src/components/ui/kit.tsx` et `button.tsx`, icônes
   `lucide-react`, **aucun `@mui`**, **thème clair uniquement**, mobile d'abord (Galaxy Z Fold7 plié ~375 px, déplié ~720 px,
   mise en page côte à côte au-delà de 600 px via `useMediaQuery(WIDE)`), cibles ≥ 44 px, titres d'écran dans la barre du haut
   (`pwa/src/app/Shell.tsx`). Modèles : `pages/ShowsPage.tsx`, `components/EpisodeDetail.tsx`, `pages/MindPage.tsx`.
4. **Aucun appel payant réel** pendant les tests (Gemini, OpenAI, Deepgram simulés).
5. **Déploiement et migrations en production : uniquement après l'accord explicite de l'utilisateur pour ce lot**, et toujours
   avec la procédure du § 6 (sauvegarde avant toute migration). Annoncer avant : ce qui part, les migrations, les risques.
6. Résumé de chaque chantier dans `docs/CODEX_<CHANTIER>.md` ; commits en français, fin : `Co-Authored-By: Codex`.

## 3. Chantiers, dans l'ordre conseillé

### V9-1 — Composants (reprend K8 de `BRIEFS_CODEX_VAGUE8.md`)
Réaliser les composants décrits dans K8 (QuizCard, LevelFeedbackButtons, RelatedList, EventGroupCard, WordPickSheet +
WordPicksList, mode sélection), **avec leurs tests**. La page `/demo` est facultative désormais : les composants sont branchés
directement (V9-2).

### V9-2 — Intégration dans les écrans
- **Détail d'une version** (`components/PreparedEpisode.tsx` et `pages/ContentPage.tsx`, sous la transcription) : `QuizCard`
  (le bouton « Réécouter ce passage » appelle `reader.play(segment.startMs/1000)`), puis `LevelFeedbackButtons` (passer
  `showId` quand le contenu vient d'un épisode).
- **Transcription** (`content/VariantTranscript.tsx`) : sélection d'un mot ou d'une expression dans un passage anglais (appui
  long ou sélection de texte) → `WordPickSheet` avec la phrase du passage, `contentId`, `publicationId`, `variantKey`, `segmentIndex`.
  Attention : l'appui long sert déjà à « l'original de ce passage » (I3) ; proposer les deux actions dans un même volet plutôt
  que deux gestes concurrents. **Mots gardés** : une entrée dans Réglages ou Bibliothèque (`WordPicksList`).
- **Voir aussi / Même événement** : `RelatedList` en bas du détail d'épisode (`EpisodeDetail`), d'article (`ArticleDetail`) et de
  note (`NoteEditor`, sous « En anglais »).
- **Cartes d'événement dans Explorer** (`explorer/ExplorerFeed.tsx`) : insérer `EventGroupCard` dans le fil (par exemple une carte
  par jour, en tête de journée, pour les groupes `dossierCandidate` récents), masquable ; « Préparer un condensé » crée le
  dossier (`POST /api/dossiers`, contrat D2) puis ouvre `DossierPrepareDialog`.
- **Mode sélection** : appui long sur une carte d'Explorer (`explorer/FeedCards.tsx`) et de la Bibliothèque
  (`library/PreparedContents.tsx`, épisodes sauvegardés) ; barre flottante au-dessus du mini-lecteur ; « Créer un dossier »
  (2 à 6 éléments, articles compris). Sortie du mode : bouton Annuler, retour arrière Android.
- Recette dans le navigateur à 375 et 720 px avec l'API de production en lecture (voir § 6, « recette locale »).

### V9-3 — Atelier : synchronisation automatique des mots (= A8 de la vague 8)
Tel que décrit dans `BRIEFS_CODEX_VAGUE8.md` (A8).

### V9-4 — I4 : écoute active (PWA)
Dans le lecteur et le détail d'une version : **répéter la phrase en cours** (retour au début du segment), **pause automatique
après chaque passage** (option), **ralentir une phrase** (lecture du segment à 0,75 puis reprise de la vitesse choisie).
S'appuyer sur `player/PlayerProvider.tsx`, `content/useContentReader.ts` et les segments horodatés ; seulement quand la
synchronisation est vérifiée (`reader.verified`). Tests de la logique (calcul des bornes de segment, enchaînement des pauses).

### V9-5 — Calibration du rapprochement (avec l'utilisateur)
Lancer `convert/discover_related_calibrer.py` pour exporter un CSV de paires, le donner à l'utilisateur à remplir
(`meme_evenement`), puis relire le CSV rempli et proposer des seuils (`relatedSameLanguageScore`, `relatedCrossLanguageScore`,
`relatedDoubtScore`) dans `config_discover.json` après accord. Ne pas activer `relatedLlm` sans accord (appels payants, faibles).

### V9-6 — Ménage
- Supprimer les **worktrees déjà fusionnés** de `discover-mymind` (une trentaine : `../discover-mymind-*`, `/private/tmp/discover-mymind-codex-*`,
  `~/.codex/worktrees/*`) et de `convert` (`../convert-*`, `/private/tmp/convert-codex-*`) : pour chacun, vérifier que sa branche est
  fusionnée (`git branch --merged`) et qu'il n'a **aucune modification non commitée**, puis `git worktree remove` et suppression de
  la branche fusionnée. En cas de doute, lister et demander.
- Ne **rien** supprimer dans `convert/` lui-même, ni dans `discover-backups/`.

## 4. Points qui attendent une décision de l'utilisateur (ne pas trancher seul)

- **Migration SRT d'EnglishFluency** (`englishfluency-worker/migrations-en-attente/0018_remove_srt_library.sql`) : efface
  définitivement les tables `srt_*`. À appliquer seulement sur accord explicite, sous un numéro supérieur au dernier appliqué
  (0021), après sauvegarde.
- **`englishfluency-app/`** (ancienne app React Native, branche `docs/avancement-deepgram-pipeline`, ~60 fichiers modifiés non
  commités) : demander s'il faut la garder, la commiter ou l'archiver ; ne rien modifier sans réponse.
- **Déploiement d'EnglishPWA** : Vercel déploie la branche `main` de `bricebrain/englishpwa` à chaque push ; le dernier push
  (`32167a0`) n'a pas pu être vérifié (pas de CLI Vercel ni `gh` sur le Mac) : demander à l'utilisateur de vérifier sur Vercel.

## 5. Recettes réelles à demander à l'utilisateur (sur le Fold7)

Mode avion avec des téléchargements, partage d'un lien depuis Chrome vers Discover, premier vrai dossier (dont un article
d'Explorer), préparations automatiques (l'interrupteur général est **coupé** en production), quiz et retour de niveau après la
première préparation qui en contient.

## 6. Procédures

**Sauvegarde D1 avant toute migration en production** (Discover : base `discover`, EnglishFluency : `englishfluency`) :
1. Point Time Travel : `npx wrangler d1 time-travel info <base>` → copier la ligne « current bookmark » dans
   `../discover-backups/time-travel-bookmark-avant-<NNNN>.txt` (préfixe `ef-` pour EnglishFluency).
2. Export **table par table** (l'export complet échoue à cause des tables FTS5) : lister les tables avec
   `npx wrangler d1 execute <base> --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'search_index%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"`
   (pour EnglishFluency, exclure aussi les tables virtuelles et `%_fts%`), puis
   `npx wrangler d1 export <base> --remote --table t1 --table t2 … --output ../discover-backups/d1-avant-<NNNN>-<date>.sql`
   (en zsh, construire la liste des arguments dans un tableau).
3. `npx wrangler d1 migrations apply <base> --remote`, puis vérifier avec `migrations list`.

**Déploiement** : Discover depuis la racine `discover-mymind/` : `npm run deploy` (construit la PWA puis déploie le Worker) ;
EnglishFluency Worker : `npm run deploy` dans `englishfluency-worker/` ; Atelier : vérifier qu'aucune préparation n'est en cours
(`curl -s http://127.0.0.1:53782/api/discover/queue`, aucun élément `pending`/`leased`), arrêter le processus du port 53782, le
relancer avec la commande du § 1, puis `git push origin feat/lot1`.

**Recette locale de la PWA avec les données de production en lecture** : un fichier non commité `pwa/vite.preview-prod.config.ts`
qui fusionne `vite.config.ts` avec `preview: { port: 4173, strictPort: true, proxy: { '/api': { target: 'https://discover.bricebrain.workers.dev', changeOrigin: true, secure: true } } }`,
puis `npm run build && npx vite preview --config vite.preview-prod.config.ts`. Les écritures sont refusées par la protection CSRF
(normal) ; supprimer le fichier après la recette. Les Service Workers ne s'activent pas sur localhost dans certains navigateurs
intégrés : le hors ligne se vérifie sur le téléphone.
