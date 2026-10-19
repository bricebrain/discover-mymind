# Briefs Codex — vague 8 : composants autonomes pour l'étape 7 (19 octobre 2026)

Rédigé par Claude Opus. Opus refait les derniers écrans MUI (étape 7 : détail d'un contenu et sa transcription, détail
d'épisode, articles, éditeur de note, Explorer) et y branchera les fonctions déjà en ligne côté serveur. Pour avancer en
parallèle **sans jamais toucher aux mêmes fichiers**, Codex livre des **composants autonomes dans des fichiers neufs**, avec leurs
hooks, leurs tests et une page de démonstration ; Opus les insère ensuite dans ses écrans.

Lire d'abord : `docs/BRIEFS_CODEX_VAGUE5.md` (règles d'interface : Tailwind + shadcn/ui + Motion, **aucun import `@mui/*`**,
`pwa/src/components/ui/kit.tsx` et `button.tsx`, thème clair, Fold7 plié ~375 px et déplié ~720 px, cibles ≥ 44 px),
`docs/BRIEFS_CODEX_VAGUE2.md` (règles communes), et les contrats `docs/CODEX_Q.md`, `docs/CODEX_N.md`, `docs/CODEX_I1.md`,
`docs/CODEX_R.md`, `docs/CODEX_D2.md`. Modèles de style : `pwa/src/pages/ShowsPage.tsx`, `pwa/src/library/PreparedContents.tsx`,
`pwa/src/dossiers/DossierEditor.tsx`.

## Règle de fichiers (stricte)

- Codex crée **uniquement de nouveaux fichiers** dans `pwa/src/quiz/`, `pwa/src/levels/` (fichiers neufs à côté de
  l'existant ; `useLevelFeedback.ts` peut être étendu), `pwa/src/related/`, `pwa/src/vocabulary/`, `pwa/src/selection/`,
  plus `pwa/src/pages/DemoPage.tsx` et **une ligne** de route `/demo` dans `pwa/src/app/App.tsx`.
- **Interdit** : tout fichier existant d'Opus (`pwa/src/content/**`, `components/**`, `articles/**`, `explorer/**`, `mind/**`,
  `transcript/**`, `listening/**`, `pages/*` sauf `DemoPage.tsx`, `app/*` sauf la ligne de route). Si un composant a besoin
  d'une donnée qu'un écran devra fournir, la recevoir **en props**.
- Chaque composant : props documentées en tête de fichier, états chargement / vide / erreur / hors ligne, tests (Vitest +
  Testing Library déjà utilisés), et une section dans `DemoPage.tsx` alimentée par des données fictives (pas d'appel réseau).

---

## Brief K8 — Composants

1. **`quiz/QuizCard.tsx`** + `quiz/useQuiz.ts` — props `{ contentId, variantKey, publicationId, onSeek?(segmentIndex) }`.
   Les 3 questions (Q) : choix en grosses cibles, réponse envoyée une fois (`POST …/quiz/answers`), correction animée
   (bonne réponse, explication, bouton « Réécouter ce passage » qui appelle `onSeek`), score « 2/3 ». Questions déjà répondues
   affichées corrigées au rechargement. Version sans quiz → le composant ne rend rien.
2. **`levels/LevelFeedbackButtons.tsx`** — props `{ contentId, variantKey, showId? }`, sur `useLevelFeedback` existant :
   « Trop facile / Juste / Trop dur » en pastilles, choix actuel surligné, modifiable, message discret après envoi
   (« Merci, Discover te proposera peut-être un autre niveau »).
3. **`related/RelatedList.tsx`** + `related/useRelated.ts` — props `{ type: 'article'|'episode'|'reflection', id }` :
   « Voir aussi » (5 voisins de `GET /api/related`, icône et couleur par type comme `PreparedContents`, éditeur, lien interne)
   et, si l'élément appartient à un groupe, un encadré « Même événement · N sources » avec les membres.
4. **`related/EventGroupCard.tsx`** — props `{ group, onCreateDossier(refs) }` : carte pour le fil Explorer (groupes de
   `GET /api/related/groups`) — titre, pastilles des éditeurs, 2–3 titres, bouton « Préparer un condensé » si `dossierCandidate`
   qui appelle `onCreateDossier` avec les références (articles et épisodes). Plus `related/useEventGroups.ts`.
5. **`vocabulary/WordPickSheet.tsx`** + `vocabulary/useWordPicks.ts` — props `{ word, sentence, contentId, publicationId,
   variantKey, segmentIndex, onClose }` : volet (`Sheet` du kit) pour garder un mot ou une expression avec sa phrase
   (`POST /api/vocabulary/picks`), mot modifiable (sélection élargie à quelques mots), confirmation, état « déjà gardé »
   (réponse 200). Plus `vocabulary/WordPicksList.tsx` : liste des mots gardés avec leur état (en attente / envoyé à
   EnglishFluency / déjà connu / échec) et suppression (`DELETE`).
6. **`selection/`** — mode sélection pour créer un dossier depuis Explorer ou la Bibliothèque :
   `useSelection()` (contexte : activer par appui long, cocher/décocher des références `{type,id,title}`, 2 à 6 éléments,
   types acceptés `article | episode | content | reflection`), `SelectionBar.tsx` (barre flottante au-dessus de la navigation :
   « 3 sélectionnés · Annuler · Créer un dossier »), `SelectableCard.tsx` (enveloppe d'une carte : coche animée, retour
   haptique `navigator.vibrate` si disponible), et `CreateDossierFromSelection.tsx` qui appelle `POST /api/dossiers`
   (contrat D2, titre facultatif) puis ouvre le volet de préparation existant (`DossierPrepareDialog`, en l'important,
   sans le modifier) et vide la sélection.

## Brief A8 — Atelier : synchronisation automatique des mots

- Aujourd'hui, l'envoi des mots gardés vers EnglishFluency (`convert/discover_vocabulary_picks.py`) n'a lieu que sur demande
  (`POST /api/discover/vocabulary/sync` ou ligne de commande). Le lancer aussi **automatiquement** dans la boucle inactive de
  `discover_queue.py`, comme le rapprochement : au plus toutes les 10 minutes, seulement sans préparation en cours, désactivable
  (`vocabularyAutoSync`, activé par défaut), erreurs journalisées sans arrêter la file.
- Ajouter l'état (dernier envoi, compteurs) au panneau `discover_queue.html` / `discover_queue.js`.
- Tests verts (`python3 -m unittest discover -s tests -q`).

## Acceptation

- PWA : `npm test`, `npx tsc --noEmit -p .`, `npm run build` verts ; aucun import `@mui/*` dans les nouveaux fichiers ;
  `DemoPage` montre chaque composant dans ses états principaux à 375 et 720 px.
- `docs/CODEX_K8.md` : pour chaque composant, ses props, où Opus doit l'insérer et ce que l'écran doit lui fournir.
- Aucun déploiement, aucune migration, aucun appel payant réel.
