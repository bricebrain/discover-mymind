# Brief 1 — E : export complet

Branche `glm/e-export`, worktree `/Users/brice/mesProjects/myMobileProjects/discover-mymind-glm-e`.
Travail commencé par GLM 5.2 puis repris et corrigé par Codex le 19 octobre 2026.
**Prêt pour relecture par Claude Opus, pas encore fusionné ni déployé.**
Aucune migration, dépendance ajoutée, génération payante ou modification de `convert/`.

## Fichiers du chantier

| Fichier | Rôle |
|---|---|
| `worker/src/routes/export.ts` | routage des formats et orchestration des pages |
| `worker/src/export/data.ts` | notes, liens, abonnements, épisodes sauvegardés, progression, préparations, réglage utilisateur |
| `worker/src/export/contents.ts` | publications courantes et segments R2, métadonnées des variantes et inventaire des fichiers |
| `worker/src/export/dossiers.ts` | dossiers et exécutions avec sources capturées |
| `worker/src/export/markdown.ts` | document lisible et fragments de sections pour l’assemblage paginé |
| `worker/src/export/pagination.ts`, `constants.ts` | pagination et avertissement sur les audios |
| `worker/src/index.ts` | point d’intégration partagé : import et appel d’`exportData`, commentaire de routage |
| `worker/test/export.test.ts`, `export.fixture.ts` | 14 tests et fixture utilisant les vraies API locales D1/R2 |
| `pwa/src/api/export.ts` | appels API et assemblage des pages dans le navigateur |
| `pwa/src/api/export.test.ts` | 5 tests d’assemblage, échec réseau, réponse invalide et données manquantes |
| `pwa/src/settings/useDataExport.ts` | mutation React Query, fichiers téléchargeables, libération des URL de Blob |
| `pwa/src/settings/ExportSection.tsx` | interface MUI et liens d’enregistrement JSON / Markdown |
| `pwa/src/pages/SettingsPage.tsx` | intégration de la section dans les deux modes de connexion |
| `docs/GLM_E.md` | inventaire, contrat, validation et limites |

`worker/src/routes/reflections.ts` et son export historique ne sont pas modifiés.
Les fichiers réservés à Opus (`pwa/src/mind/*`, `App.tsx`, `vite.config.ts`, `sw.ts`) ne sont pas modifiés.
La branche part de `d7afa03` : les ajouts plus récents de `main` appartiennent à d’autres chantiers.
Les différences entre les têtes des branches ne doivent pas être interprétées comme des suppressions à appliquer.

## Inventaire

| Donnée | Décision et raison |
|---|---|
| `reflections` | incluse, corbeille comprise et marquée `deletedAt` ; corps Markdown, type, état de question, tags, dates, contenu anglais associé |
| `origin`, `source_name`, `source_url` | inclus sous `origin`, `sourceName`, `sourceUrl` pour les notes personnelles et articles |
| `reflection_links` | inclus : références de cibles, variantes, passages, citations et titres conservés même si la cible disparaît |
| `shows` | configuration incluse : podcasts / YouTube (`sourceType`, `channelId`), abonnement, filtres, réglages de préparation automatique |
| Santé de collecte des émissions | exclue : ETag, ordonnanceur, erreurs, compteurs et limites internes recalculables |
| Épisodes sauvegardés | inclus : identifiants, émission, GUID, titre, description, dates, état, durée, image, URL audio / transcription, contenu associé, vidéo |
| Autres épisodes et cache R2 de transcription éditeur | exclus : catalogue de découverte et cache technique, hors publications préparées |
| `listening_progress` | incluse : cible, `audioRef`, position, durée, terminé et date ; les URL éditeur ne sauvegardent pas l’audio |
| `prepare_queue` | toutes les lignes incluses, sans plafond silencieux à 500 : statut, options, étape, tentatives, résultat, erreur et dates |
| Jetons de bail, propriétaire / expiration du bail, jetons de commit | exclus : contrôle interne d’exécution |
| Contenus et publications courantes `ready`, non supprimés | inclus : métadonnées, droits, révision / séquence et fichiers du manifeste R2 |
| Variantes courantes | incluses : langue, niveau, style, couverture, condensation, dérivation, génération / évaluation, synchronisation |
| Segments courants R2 | inclus : identifiants, textes, traductions françaises, locuteurs, temps, `sourceSegments`, provenance ; `keyVocab` conservé |
| Anciennes publications, publications non finalisées, contenus supprimés | exclus : l’export sauvegarde l’état publié courant, sans historique technique |
| `dossiers`, `dossier_runs` | inclus : références actuelles, versions, instantanés des sources, textes capturés, options, dates et état du dernier traitement associé |
| `app_settings` | seul le réglage utilisateur `auto_prepare_enabled` est exporté, via `autoPrepareEnabled` |
| Audios R2 | octets exclus ; inventaire avec chemin, SHA-256, taille et type MIME ; récupération séparée optionnelle |
| Flux audio éditeur externes | URL incluse ; empreinte / taille inconnues (`null`), sans téléchargement ni requête vers l’éditeur |
| `sessions`, `login_attempts`, abonnements / livraisons push | exclus : données de sécurité |
| Secrets d’environnement, `ATELIER_TOKEN`, clés API | jamais lus pour produire l’export ; tests avec valeurs sentinelles |
| FTS5, `queue_events`, verrous / gardes / GC de publication | exclus : index, journaux et états internes dérivés |
| Brouillons locaux et progression non synchronisée, téléchargements hors ligne | exclus : l’API exporte les données serveur ; synchroniser les appareils auparavant |

Les liens vers un épisode non sauvegardé ou une cible supprimée restent des références avec titre et citation.
Le catalogue éphémère n’est pas recréé pour compléter ces cibles.

## Contrat v1 et v2

- `GET /api/export` et `?v=1` : **v1 historique inchangé**, y compris corbeille exclue et en-tête de téléchargement.
- `GET /api/export?v=2` : JSON v2 complet en une requête, utile pour les petits jeux de données.
- `GET /api/export?v=2&format=markdown` : Markdown autonome en une requête.
- `GET /api/export?v=2&page=0`, puis `page=1`, etc. : format paginé utilisé par la PWA.
- Version inconnue, page invalide ou format v2 inconnu : 400. Le contrôle de session existant s’applique.

Le JSON final contient `schemaVersion: 2`, `exportedAt`, `audioNotice`, `reflections`, `shows`,
`savedEpisodes`, `listeningProgress`, `preparations`, `contents`, `dossiers`, `appSettings`, `markdown`.
Chaque contenu comprend sa publication courante, ses variantes avec segments, ses sources et la liste
`files` (`path`, `sha256`, `size`, `contentType`). Un audio R2 indique notamment `sha256`, `sizeBytes`
et un `playbackPath` relatif fixé à la publication.

Une page transporte jusqu’à **50 lignes par collection légère**, **1 contenu**, **1 dossier** avec ses
exécutions, plus `pagination: { page, hasMore }` et `markdownSections`.
Elle n’embarque pas de deuxième document Markdown complet. Continuer jusqu’à `hasMore: false` ; une page
vide terminale est possible. Ordre SQL stable avec identifiants pour départager les dates identiques.
Les liens / synchronisations D1 chargés sont limités aux notes / publications de la page.

La PWA assemble les tableaux et les fragments dans l’ordre : notes, contenus préparés, dossiers,
annexes (émissions, épisodes, progression). Les textes anglais et français se suivent par paragraphe.
Les sources capturées des dossiers restent lisibles, même si la note d’origine a disparu.
Le JSON final est autonome et contient le même document que le fichier Markdown proposé à côté.
Les champs de transport `pagination` et `markdownSections` sont retirés du fichier final.

Une erreur réseau sur une page interrompt l’opération : aucun fichier partiel n’est proposé.
Un manifeste / des segments R2 absents sont signalés par `error` / `segmentsError` ; les autres données
restent exportables et l’interface avertit que des textes sont manquants.

## Audios

Les octets audio ne sont pas incorporés. Les empreintes et tailles proviennent des manifestes validés
à la publication, sans relecture ni recalcul des gros blobs pendant l’export.
Les URL de lecture exigent la session et peuvent disparaître : **ce ne sont pas des sauvegardes**.
Pour une sauvegarde audio réelle, récupérer séparément les fichiers R2 et vérifier leurs tailles et SHA-256.
Les flux officiels peuvent changer et leurs octets ne sont pas conservés par Discover.

Le ZIP par contenu est différé : aucune dépendance d’archivage ajoutée et aucun téléchargement massif
ni calcul CRC / SHA des audios imposé au Worker gratuit. Une récupération locale séparée est une piste
future ; aucun script audio n’est livré et aucun changement de l’Atelier n’est nécessaire à ce chantier.

## Validation dans le worktree

Dépendances existantes vérifiées avec `npm install --ignore-scripts --no-audit --no-fund` dans les deux projets.
Aucun changement de version ni de lockfile. Le type Worker ignoré par Git était déjà présent.

| Commande | Résultat |
|---|---|
| `worker/` : `npx tsc --noEmit -p .` | OK |
| `worker/` : `npm test` | 20 fichiers, **250 tests** réussis, dont 14 pour l’export |
| `pwa/` : `npx tsc --noEmit -p .` | OK |
| `pwa/` : `npx vitest run` | 12 fichiers, **71 tests** réussis, dont 5 pour l’assemblage d’export |
| `pwa/` : `npm run build` | OK, 33 entrées de précache ; avertissement Vite sur le chunk principal > 500 ko |
| `git diff --check` | OK |

Le test volumétrique utilise **105 notes, 503 préparations, 1 contenu à 2 variantes et 1 dossier** :
**11 pages**, aucun doublon ni omission, comparaison avec l’export non paginé.
La taille UTF-8 de chaque page est calculée et vérifiée **inférieure à 100 000 octets** sur cette fixture.
Les tests vérifient aussi les champs Article, les textes bilingues, les métadonnées de génération,
le vocabulaire, la corbeille, les secrets, le v1 par défaut, les paramètres invalides et les fichiers R2 manquants.
Aucun test Python lancé : `convert/` est hors périmètre explicite.

## Limites et recette manuelle

La limite CPU de l’offre Workers gratuite est de **10 ms par requête** :
[documentation Cloudflare](https://developers.cloudflare.com/workers/platform/limits/).
La durée des tests locaux et le temps d’attente D1/R2 **ne mesurent pas** le CPU en production.
La pagination réduit le travail et la mémoire par requête ; elle ne garantit pas qu’un contenu exceptionnellement
long, un dossier avec beaucoup d’exécutions ou 50 très longues notes reste sous cette limite.
La version v2 non paginée conserve ce risque ; préférer le parcours PWA paginé.
Une pagination plus fine des segments / exécutions serait nécessaire si la recette révèle un dépassement.

L’assemblage final utilise la mémoire du navigateur. Il n’y a pas de snapshot transactionnel global entre pages :
un changement simultané des données peut décaler la pagination. Lancer l’export hors modification / publication
et le relancer si les données ont changé. `exportedAt` est la date de la première page côté PWA.
L’import / restauration automatique reste hors périmètre.

Étapes pour Claude Opus :

1. Relire et fusionner uniquement cette branche ; conserver les travaux plus récents de `main`.
2. Déployer Worker et PWA selon le processus habituel. **Aucune migration à appliquer.**
3. Sur les données réelles, lancer « Exporter tout », puis enregistrer le JSON et le Markdown depuis les deux liens.
   Vérifier aussi ce parcours sur Fold7, avec connexion activée puis désactivée selon la configuration de recette.
4. Contrôler notes Article / corbeille, segments bilingues, sources capturées et nombre de préparations.
5. Mesurer le CPU par requête et les tailles réelles dans les métriques Worker après déploiement autorisé.
6. Vérifier le bouton historique et traiter les éventuels avertissements de fichiers manquants.
