# Répartition Opus / Codex et briefs Codex — vague 5 (19 octobre 2026)

Rédigé par Claude Opus. Q, N et W (vague 3) sont fusionnés et en production (migrations 0020–0022). La vague 4 (V, I1,
`docs/BRIEFS_CODEX_VAGUE4.md`) n'est pas commencée : elle reste valable et peut tourner **en parallèle** de celle-ci.

## Répartition

| Qui | Chantier | Fichiers |
|---|---|---|
| **Opus** | Étape 7 de la refonte : détail d'un contenu (versions, transcription, `VariantControls`, `VariantTranscript`, `TranscriptView`), détail d'épisode (`EpisodeDetail`, `EpisodeCard`, `EpisodeBrowser`, `PreparedEpisode`, `OriginalAccess`, `DownloadButton`), articles (`ArticleCard`, `ArticleDetail`, `ExplorerFeed`), éditeur de note et ses composants (`NoteEditor`, `ArticleFetch`, `NoteOriginFields`, `NotePreparation`, `SharePage`), `LoginPage`, `OfflineBanner`, puis retrait de MUI (`App.tsx`, `theme.ts`, `package.json`) | `pwa/src/content/**`, `pwa/src/components/**`, `pwa/src/articles/**`, `pwa/src/explorer/**`, `pwa/src/mind/**`, `pwa/src/transcript/**`, `pwa/src/listening/**`, `pwa/src/offline/**`, `pwa/src/pages/{ContentPage,LoginPage}.tsx`, `pwa/src/app/{App,theme}.ts(x)` |
| **Opus** | Interface du quiz (Q) et boutons « trop facile / juste / trop dur » (N) dans le détail d'une version | idem (même écran que l'étape 7) |
| **Opus** | Ménage des anciens worktrees fusionnés ; I4 (écoute active) après la refonte | — |
| **Codex** | **C5 — Écran « Ma semaine »** (W) | nouveaux fichiers `pwa/src/weekly/**`, `pwa/src/pages/WeekPage.tsx` ; une ligne de route dans `pwa/src/app/App.tsx` ; un lien dans `pwa/src/pages/SettingsPage.tsx` |
| **Codex** | **L5 — Niveau suggéré dans Abonnements** (N) | `pwa/src/shows/**`, `pwa/src/pages/ShowsPage.tsx`, `pwa/src/api/shows.ts`, nouveau `pwa/src/levels/**` |
| **Codex** | **A5 — Atelier : quiz pour tous les types et dossier de bout en bout** | `convert/discover_*.py`, `convert/tests/**` |
| **Codex** | Vague 4 : **V** (vocabulaire enrichi dans EnglishPWA) et **I1** (mots vers EnglishFluency, serveur + Atelier) | voir `BRIEFS_CODEX_VAGUE4.md` |

Aucun fichier n'est partagé entre les deux colonnes, sauf `App.tsx` (Codex : une seule ligne de route ; Opus : retrait de MUI,
qui viendra après la fusion de C5).

## Règles communes

Celles de `docs/BRIEFS_CODEX_VAGUE2.md` restent valables (worktree par chantier, pas de déploiement ni de migration en
production, pas d'appel payant, `git add` ciblé, tests verts, résumé `docs/CODEX_<CHANTIER>.md`), avec ces changements :

- **La PWA est ouverte à Codex, uniquement dans les fichiers de sa colonne.** Ne jamais modifier un fichier de la colonne Opus ;
  en cas de besoin, le signaler dans le résumé.
- **Interface : Tailwind + shadcn/ui + Motion, aucun import de `@mui/*`.** Réutiliser `pwa/src/components/ui/button.tsx` et
  `pwa/src/components/ui/kit.tsx` (`Sheet`, `ConfirmSheet`, `Notice`, `Spinner`, `Switch`, `Field`, `Select`, `Checkbox`,
  `PillTabs`, `SectionTitle`, `cardCls`, `inputCls`) ; icônes `lucide-react` ; jetons de `pwa/src/styles/app.css`.
  Modèles à imiter : `pwa/src/pages/ShowsPage.tsx`, `pwa/src/pages/LibraryPage.tsx`, `pwa/src/library/PreparedContents.tsx`.
- **Thème clair uniquement** ; mobile d'abord (Galaxy Z Fold7 plié ~375 px et déplié ~720 px), cibles tactiles ≥ 44 px,
  animations courtes, respect de `prefers-reduced-motion` (déjà global).
- Le titre de l'écran va dans la barre du haut (`pwa/src/app/Shell.tsx`, colonne Opus) : demander la ligne dans le résumé ;
  la page garde un `<h1 className="sr-only">`.
- Tests PWA : `npm test`, `npx tsc --noEmit -p .` et `npm run build` dans `pwa/`.

---

## Brief C5 — Écran « Ma semaine »

API déjà en production (`docs/CODEX_W.md`) : `GET /api/weekly?week=YYYY-Www` et `GET /api/weekly/export?week=…` (Markdown).

- Page `/week` : sélecteur de semaine (précédente / suivante, semaine courante par défaut, pas de semaine future), chiffres clés
  (minutes écoutées, contenus terminés, notes créées et modifiées, articles lus et enregistrés, passages liés, préparations
  publiées) avec l'écart par rapport à la semaine précédente, puis les listes (écoutes, notes, articles, publications) avec un lien
  vers chaque élément dans l'app.
- Bouton « Exporter pour NotebookLM » : télécharge le Markdown (`discover-weekly-<semaine>.md`) ; pas de copie dans le presse-papiers
  si le navigateur la refuse, juste le téléchargement.
- États : chargement, semaine vide (message encourageant, pas d'erreur), erreur 422 `weekly_limit_exceeded`, hors ligne.
- Accès : un lien « Ma semaine » dans Réglages (section en tête) ; route ajoutée dans `App.tsx`.
- Tests : composants purs testables (formatage des écarts, calcul de semaine ISO côté client cohérent avec `worker/src/weekly/week.ts`).

## Brief L5 — Niveau suggéré dans Abonnements

API en production (`docs/CODEX_N.md`) : `GET /api/shows/:id/level-suggestion`, `POST /api/contents/:id/variants/:key/feedback`.

- Dans la ligne d'une émission podcast (`ShowRow` de `ShowsPage.tsx`) ou dans le volet de préparation automatique
  (`AutoPrepare.tsx`) : quand une suggestion existe (`changed: true`), afficher « Essayer B2 ? » avec la raison, et un bouton qui
  applique le niveau par le PATCH existant de l'émission (`autoLevel`). Jamais d'application automatique ; possibilité d'ignorer
  (mémorisée localement par émission et par niveau suggéré, `localStorage` protégé par try/catch).
- Fournir dans `pwa/src/levels/` le hook `useLevelFeedback(contentId, variantKey)` (envoi, retour actuel, invalidation des
  requêtes `shows` et de la suggestion) et ses types, **sans interface** : Opus l'utilisera dans le détail d'une version.
- Tests : hook et logique d'affichage de la suggestion.

## Brief A5 — Atelier : quiz pour tous les types et dossier de bout en bout

- Vérifier que les 3 questions de compréhension (Q, `convert/discover_quiz.py`) sont générées et publiées pour **tous** les
  types de préparation : podcast (fait), vidéo YouTube, note My Mind (réflexion et article), dossier multisources. Brancher les
  types manquants au même endroit que les podcasts, avec la même tolérance (quiz invalide ou IA indisponible → publication sans quiz).
- Écrire un test de bout en bout **simulé** de la préparation d'un dossier (`convert/discover_dossier.py`) : file → bail →
  préparation de chaque source → synthèse → paquet → publication simulée, avec un faux client IA et un faux Worker. Corriger ce
  qui casse ; ne rien appeler de payant.
- Vérifier que les dépenses du quiz apparaissent dans `discover_costs.py` pour chaque type.
- Acceptation : tests verts (`python3 -m unittest discover -s tests -q`), résumé listant les types couverts et les corrections.
