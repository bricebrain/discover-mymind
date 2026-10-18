# Briefs pour GLM 5.2

Rédigés par Claude Opus le 19 octobre 2026. Lire d'abord `docs/PLAN_PARTAGE_CODEX_OPUS.md` (surtout §§ 6, 9 et 10),
`docs/PHASE0_ARCHITECTURE.md`, puis le code concerné. Trois chantiers **indépendants** : un brief = une branche = un worktree.

## Règles communes (non négociables)

1. **Un worktree par chantier**, jamais dans `discover-mymind/` lui-même (Claude Opus y travaille) :
   `git -C discover-mymind worktree add -b glm/<chantier> ../discover-mymind-glm-<chantier> main`.
   Dépendances : `npm install` dans `pwa/` et `worker/` du worktree (`.npmrc` : legacy-peer-deps).
2. **Aucun déploiement, aucune migration en production, aucune génération payante** (Gemini, OpenAI, Deepgram). Claude Opus
   relit, fusionne et déploie.
3. **Migrations** : 0014 est réservée par Opus. Si E en a besoin, utiliser **0015** et le signaler.
4. **`convert/` (Atelier Python)** : dépôt séparé contenant du travail personnel non commité (vocabulaire : `interface.html`,
   `convertisseur_web.py`, `bundles.py`, `vocabulaire*`, `README.md`, `.gitignore`…). **Ne jamais** faire `git add .`,
   `git add -A`, `reset`, `checkout --`, `stash` ni nettoyage global. Ajouter fichier par fichier, uniquement les vôtres.
   Ne pas modifier les fichiers listés ci-dessus.
5. **Fichiers partagés sensibles** (petits points d'intégration seulement, à signaler dans le résumé) : `worker/src/index.ts`,
   `pwa/src/app/App.tsx`, `pwa/src/app/Shell.tsx`, `pwa/src/pages/LibraryPage.tsx`, `pwa/src/pages/ContentPage.tsx`,
   `pwa/src/api/contents.ts`, `pwa/src/player/PlayerProvider.tsx`, `pwa/src/content/*`.
6. Stack : React 18, TypeScript strict, MUI v5, React Query v5, react-router 7 ; Worker Cloudflare (D1, R2) ; vitest.
   Pas de Tailwind ni de nouvelle dépendance sans justification. Garder le design actuel, textes en français.
7. **Avant de rendre** : `npx tsc --noEmit -p .` et `npm test` (worker), `npx tsc --noEmit -p .`, `npx vitest run` et
   `npm run build` (pwa) ; tests Python : `python3 -m unittest discover -s tests -q` dans `convert/`.
   Commits ciblés, message en français, fin de message : `Co-Authored-By: GLM 5.2`.
8. **Résumé de fin** dans `docs/GLM_<CHANTIER>.md` : fichiers modifiés, choix, commandes et résultats, limites, étapes manuelles.

---

## Brief 1 — E : export complet (lot 12)

**But** : un export exploitable de tout ce qui appartient à l'utilisateur, au-delà de l'export actuel.

**Existant** : `GET /api/export` → `exportAll` dans `worker/src/routes/reflections.ts` (notes, liens, Markdown dans le JSON,
émissions, épisodes sauvegardés ; `schemaVersion: 1`). Bouton dans `pwa/src/pages/SettingsPage.tsx`. **Le conserver
fonctionnel** pendant l'extension.

**À faire**
- Inventaire écrit (dans `docs/GLM_E.md`) de chaque donnée : incluse, exclue ou optionnelle, et pourquoi.
- Nouveau format `schemaVersion: 2` (le v1 reste servi tel quel si demandé, par ex. `?v=1`) contenant au minimum :
  notes (y compris corbeille, marquée), liens et citations, émissions et chaînes YouTube suivies (`shows`, `source_type`,
  `channel_id`), épisodes sauvegardés, progression d'écoute (`listening_progress`), préparations (file : statut, options,
  dates), **contenus préparés** (contenu, variantes, segments de chaque variante courante via le manifeste R2),
  **dossiers** (`dossiers`, `dossier_runs` : sources capturées, options).
- Markdown exploitable : un document lisible (notes, puis contenus préparés avec texte anglais et traduction française
  par paragraphe, puis dossiers avec leurs sources).
- **Audios** : ne pas les inclure dans le JSON. Stratégie explicite et documentée : liste des fichiers avec empreinte
  SHA-256 et taille, et indication claire que les URL de lecture ne sont **pas** une sauvegarde (elles exigent la session et
  peuvent disparaître). Option à étudier : export d'un contenu à la fois avec son audio (zip) — seulement si simple et sans
  dépasser les limites du Worker gratuit (10 ms CPU) ; sinon, le documenter comme limite.
- Jamais exporter : clés API, jetons, sessions, `login_attempts`, abonnements push, `ATELIER_TOKEN`.
- Pagination ou flux si le volume l'exige (le Worker gratuit a peu de CPU) : mesurer et documenter.
- PWA : bouton « Exporter tout » (JSON + Markdown) dans Réglages, sans retirer l'existant.

**Fichiers** : `worker/src/routes/export.ts` (nouveau, préféré à alourdir `reflections.ts`), petit point d'entrée dans
`worker/src/index.ts`, tests `worker/test/export.test.ts`, `pwa/src/pages/SettingsPage.tsx`.

**Acceptation** : un export v2 contient notes, progression, contenus avec segments, dossiers ; ne contient aucun secret
(test qui le vérifie) ; l'export v1 est inchangé ; le Markdown se lit sans outil.

---

## Brief 2 — I3 + I5 : écoute (PWA uniquement)

**I3 — Basculer sur l'original au même passage.** Dans une version adaptée, chaque paragraphe cite ses passages source
(`sourceSegments`, voir `pwa/src/api/contents.ts` et `pwa/src/content/useVariantTranscript.ts`).
- Un appui long (et un bouton accessible, par ex. dans un menu du paragraphe) sur un paragraphe propose « Écouter l'original ici ».
- Si la variante source a un audio **synchronisé** (`timingVerified`, `pwa/src/content/variants.ts`) : passer le lecteur sur la
  variante source au début du premier passage cité, avec un bouton « Revenir à la version B1 » qui reprend la version adaptée à
  l'endroit quitté.
- Sinon (pas d'audio, audio non synchronisé, flux éditeur sans horodatage fiable) : afficher le **texte** des passages source
  cités, sans inventer d'instant.
- Dossiers multisources (`content.sources`, `provenance` dans la source) : ouvrir la source d'origine comme le font déjà les
  pastilles (`pwa/src/dossiers/SegmentSources.tsx`) ; ne pas dupliquer cette logique.

**I5 — Enchaînement et minuterie.**
- Minuterie de sommeil dans le mini-lecteur : 15 / 30 / 45 min et « fin de l'épisode » ; état visible ; annulation.
- Enchaînement : option « lire ensuite » qui enchaîne les versions **téléchargées** (module hors ligne `pwa/src/offline/`,
  `useOffline()`), dans l'ordre de la liste des téléchargements ; désactivable.
- Media Session (écran verrouillé) : les commandes existantes doivent continuer de fonctionner.

**Fichiers** : nouveaux modules `pwa/src/listening/` (préféré), intégrations minimales dans `pwa/src/player/MiniPlayer.tsx`,
`pwa/src/player/PlayerProvider.tsx` (signaler chaque changement), `pwa/src/content/VariantTranscript.tsx`. Tests vitest
pour la logique (choix du passage, retour à la position, fin de minuterie, ordre d'enchaînement).

**Acceptation** : sur une version avec original synchronisé, l'aller-retour garde la position de la version adaptée ;
sans synchronisation, le texte source s'affiche ; la minuterie « fin de l'épisode » arrête à la fin ; l'enchaînement passe à la
version téléchargée suivante. Aucun changement Worker.

---

## Brief 3 — I9 : coûts visibles dans l'Atelier

**But** : voir ce que coûte chaque préparation et chaque mois (Gemini, OpenAI en repli, Deepgram), avant d'essayer les
préparations automatiques par émission.

**Existant** (dépôt `convert/`) :
- `discover_ai.py` : `Client.appels` enregistre par appel `provider`, `model`, `inputTokens`, `outputTokens` ;
  `statistiques()` est copié dans `prepared['generation']` (`discover_preparation.py`) puis dans le manifeste.
- `discover_tts_budget.py` : registre SQLite Deepgram (`requests`, coût en micro-dollars, 0,03 USD / 1 000 caractères),
  `status()` mensuel ; `discover_tts_settings.status()` alimente la page audio de l'Atelier.
- Interface : `discover_queue.html` / `discover_queue.js`, routes `discover_http.py`.

**À faire**
- Tarifs **configurables** (fichier d'exemple `config_discover.example.json`, clé `pricing`), par modèle : prix d'entrée et de
  sortie par million de jetons ; valeurs par défaut prudentes et documentées, marquées « à vérifier » (ne pas les inventer
  comme exactes).
- Registre local des coûts IA par préparation (SQLite à côté du registre Deepgram, ou JSON par dossier `prepared-*`),
  alimenté à la fin de chaque préparation à partir de `Client.appels` ; idempotent (une préparation reprise ne compte pas deux fois).
- Route locale `GET /api/discover/costs` : mois en cours et précédent (Gemini, OpenAI, Deepgram, total), et les 20 dernières
  préparations (titre, date, coûts par fournisseur, voix utilisée, repli éventuel).
- Interface : bloc « Coûts » dans l'onglet Contrôles de la page Discover de l'Atelier (style existant, jetons CSS `--fond`,
  `--accent`…), avec le plafond Deepgram restant.
- Ne jamais afficher ni journaliser de clé API.

**Fichiers** : nouveau `discover_costs.py`, `discover_http.py` (route), `discover_preparation.py` (appel en fin de
préparation, petit point d'intégration), `discover_queue.html` / `discover_queue.js`, `config_discover.example.json`,
tests `tests/test_discover_costs.py`. **Aucun** fichier du travail vocabulaire.

**Acceptation** : après une préparation simulée (client et transport factices dans les tests), le coût apparaît une seule fois
dans le mois ; Deepgram et IA sont additionnés correctement ; tarifs modifiables sans changer le code.

---

## Remise

Pour chaque chantier : branche `glm/<chantier>` prête, résumé `docs/GLM_<CHANTIER>.md`, tests verts. Prévenir l'utilisateur ;
Claude Opus relit, demande des corrections si besoin, fusionne et déploie.
