# Discover — reste à faire et partage Codex / Claude Opus

État au 19 octobre 2026. Document de coordination, sans lancement automatique des chantiers.
Référence fonctionnelle : `PHASE0_ARCHITECTURE.md`, complétée par les documents des lots.
La répartition ci-dessous est proposée à l’utilisateur et à Opus ; elle ne signifie pas qu’Opus a déjà commencé.

## 1. Ce qui est déjà livré

- Lots 0 à 9 : socle, collecte podcasts, lecteur, My Mind minimal, transcriptions, publication atomique, variantes et préparation Atelier.
- Temps réel Mac → PWA et Web Push. Réception Fold7 confirmée ; fermeture de la PWA et ouverture depuis la notification restent à vérifier.
- Catalogue de podcasts révisé ; abonnements à des chaînes YouTube et collecte de leurs vidéos.
- Ajout d’un lien YouTube et préparation d’une note My Mind depuis la PWA.
- Bibliothèque avec onglets par source, recherche de titre côté serveur et file des préparations.
- Deepgram Aura-2 dans l’Atelier : Cora / Vesta / Draco, budget local de 10 USD/mois, cache, repli Heart. Le Mac est encore nécessaire.
- Export existant : notes, liens, Markdown inclus dans le JSON, émissions et épisodes sauvegardés. Ce n’est pas encore un export complet des contenus et médias.

Points de départ Git : Discover `7844f54`, Atelier `0d80d41`.
Les anciens totaux de tests dans les documents décrivent leur livraison respective, pas un état cumulatif à additionner.

## 2. Liste des travaux restants

| ID | Chantier | À réaliser | Responsable proposé | Dépendances |
|---|---|---|---|---|
| A | Dossiers multisources manuels | Sélectionner podcasts, vidéos ou notes ; enregistrer un dossier ; options communes ; une préparation Atelier ; références aux sources par passage ; répétitions évitées et désaccords conservés | Codex | Contrat dossier / file / publication à définir avant le code |
| B | Bibliothèque hors ligne — fin du lot 11 | Télécharger explicitement une version préparée avec son texte ; état et espace utilisé ; supprimer les téléchargements ; lecture et navigation en mode avion ; progression à resynchroniser | Opus | APIs de lecture existantes ; aucune dépendance à A pour les contenus actuels |
| C | My Mind complet — lot 10 | UI tags et types ; états des questions ; édition des liens multiples ; capture d’un passage et retour à la bonne version ; vraie recherche plein texte côté serveur | Opus, après B | Préserver brouillons IndexedDB et gestion des conflits |
| D | Préparation ponctuelle sans Mac | Orchestration cloud, acquisition/transcription disponible, adaptation, contrôle, TTS, publication, suivi et budgets explicites ; éviter qu’une demande soit exécutée à la fois par le Mac et le cloud | Codex, après A | Étude des sources réellement traitables et des limites d’exécution ; contrat commun aux deux exécutants |
| E | Export complet — lot 12 | Inventaire des données exportables ; contenus, variantes, segments, progression, abonnements YouTube et futurs dossiers ; Markdown exploitable ; stratégie explicite pour les audios | Opus, après C et contrat A stabilisé | Ne pas présenter des URLs temporaires comme une sauvegarde des médias |
| F | Pont EnglishFluency — lot 12 | Option Atelier « aussi vers EnglishFluency » ; correspondance des formats ; envois indépendants ; idempotence et reprise d’un échec partiel | Codex, après D ou en remplacement si D est différé | Vérifier le contrat réel EnglishFluency et le code de publication Atelier |
| G | Suggestions de sources complémentaires | Proposer des rapprochements pertinents ; expliquer pourquoi ; validation manuelle avant préparation | À répartir plus tard | A livré et utilisé ; choix IA locale / règles / autre moteur à évaluer |
| H | Recette et exploitation | Fold7 physique, fidélité éditoriale, mesures du cron et quotas, parcours de sécurité et réactivation de la connexion au moment choisi | Codex + Opus ; manipulations téléphone par l’utilisateur | Voir § 5 |

Priorité : A et B en parallèle, puis C et D. E et F ferment les fonctions V1 restantes.
G reste une évolution ultérieure. La préparation cloud a été souhaitée après la V1 initiale ; elle ne doit pas bloquer les autres livraisons.

## 3. Première vague : partage précis

### Codex — A : dossiers multisources

Première livraison : sélection manuelle et synthèse commune. La suggestion automatique de sujets n’en fait pas partie.

Avant l’implémentation, écrire un contrat partagé couvrant :

- références des sources, ordre, révisions ou instantanés utilisés ;
- sources indisponibles, supprimées ou sans transcription exploitable ;
- options de préparation et limites de taille / nombre de sources à choisir et documenter ;
- dossier modifié pendant un traitement : le résultat reste rattaché aux sources réellement traitées ;
- déduplication, bail, reprise et publication atomique ;
- provenance d’un passage vers une ou plusieurs sources, sans inventer de précision absente des transcriptions ;
- comportement du lecteur et compatibilité des anciens manifestes.

Périmètre principal : nouveaux modules de dossiers dans Worker/PWA, migrations, contrats, queue et publication ; pipeline Python dans `convert/`.
Fichiers sensibles partagés : `worker/src/index.ts`, `pwa/src/app/App.tsx`, `pwa/src/pages/LibraryPage.tsx`, `pwa/src/api/contents.ts`, composants de lecture.
Codex coordonne leurs modifications avec Opus ; préférer de petits points d’intégration et des modules séparés.

Acceptation : deux sources complémentaires donnent une préparation commune dont les passages renvoient aux bonnes sources ; une divergence est explicitée ; une reprise ne duplique pas la publication ; les contenus à source unique restent lisibles.

### Claude Opus — B : hors ligne

Première livraison indépendante des dossiers : versions préparées existantes, audio R2 et segments.

- Action explicite de téléchargement par version ; progression, annulation et échec visibles.
- Conserver métadonnées et transcription nécessaires pour ouvrir le contenu sans réseau.
- Marquer une version disponible seulement après téléchargement complet et validation suffisante ; téléchargement interrompu non présenté comme terminé.
- Lecture audio avec recherche dans la piste, reprise, changement d’écran et transcription en mode avion.
- État « téléchargé », liste des téléchargements, octets utilisés et suppression locale.
- Distinguer une version téléchargée d’une nouvelle publication serveur ; ne pas changer silencieusement l’audio local.
- Préserver la progression locale puis la synchroniser au retour du réseau selon une politique explicite.
- Exclure les flux officiels externes du téléchargement dans cette première livraison.
- Gérer stockage insuffisant, éviction du navigateur, fichier absent et concurrence entre onglets.
- Définir le traitement du cache lors d’une déconnexion ou d’un changement de session ; une révocation distante n’est pas détectable instantanément hors ligne.
- Préserver Push, clic notification, précache et navigation du Service Worker.

Périmètre principal : nouveaux modules `pwa/src/offline/`, `pwa/src/sw.ts`, tests associés ; intégrations ciblées au lecteur et à la bibliothèque.
Commencer par les services, hooks et composants isolés. Signaler les changements nécessaires aux fichiers partagés avant de les modifier en parallèle.
Ne pas modifier le contrat de publication, les migrations, le Worker ou l’Atelier pour ce chantier sans coordination explicite.

Acceptation : télécharger une version réelle, passer en mode avion, relancer la PWA, ouvrir le contenu, lire et avancer dans l’audio avec le texte, puis supprimer le téléchargement et vérifier l’espace libéré. Compléter par tests ciblés du cache, des interruptions et de la progression.

## 4. Détails des lots V1 incomplets

### C — My Mind

Le backend et le schéma possèdent déjà types, tags et références de passages. La table FTS5 existe également.
L’interface actuelle ne propose pas encore l’ensemble de ces fonctions ; sa recherche filtre localement le titre et l’extrait, pas tout le texte en base.
La préparation en anglais d’une note existe : la conserver, ne pas la refaire.

À compléter :

- préserver tags, type et état de question dans les brouillons et la synchronisation ;
- ajouter leurs contrôles UI et filtres ;
- gérer `question_state` par l’API, actuellement absent des champs modifiables ;
- créer / modifier plusieurs liens et citations, vérifier leur cible et ouvrir le bon passage ;
- alimenter et maintenir l’index plein texte, y compris modifications, corbeille et suppressions ;
- pagination serveur et recherche du corps complet ; traiter séparément les brouillons non synchronisés ;
- vérifier les conflits concurrents, notamment qu’un conflit ne modifie pas les liens de la note.

### E — Export complet

Conserver l’export existant pendant l’extension. Préciser ce qui est inclus, exclu ou optionnel : corbeille, progression, préparations en attente, dossiers, versions et médias.
Les clés API, jetons et sessions ne sont jamais exportés. Définir le versionnement du format et vérifier la cohérence des liens.
L’import / restauration automatique n’a pas encore été demandé : distinguer un export exploitable d’une fonction d’import.

### D — Sans Mac

Deepgram TTS à lui seul ne suffit pas : acquisition de la source, transcription, adaptation, vérification et publication doivent aussi fonctionner sans l’Atelier.
Définir un périmètre réalisable par source. YouTube peut demander un traitement différent des podcasts ; aucune promesse de support universel avant l’étude.
Prévoir secrets serveur, plafonds cloud distincts du budget local de l’Atelier, estimations avant appels et prévention des doubles facturations.
Choisir l’infrastructure après étude des durées, volumes et possibilités des fournisseurs ; ne pas faire tourner une préparation longue dans une simple requête Worker.

Décision utilisateur du 19 octobre 2026 : **ne pas utiliser Workers AI pour les préparations sans Mac**. Le quota gratuit étudié ne couvre pas les préparations longues souhaitées ; cette piste et le mode « gratuit uniquement » sont retirés du périmètre.

Conserver l’API Deepgram directe pour la voix du futur parcours cloud, avec estimation avant génération et plafond cloud distinct du budget local de l’Atelier. Aucun basculement automatique vers Workers AI. Le traitement sans Mac reste à développer ; cette décision ne change pas l’intégration Deepgram déjà active dans l’Atelier.

## 5. Validations encore nécessaires

Les cases décochées de § 13 de l’architecture ne signifient pas toutes « fonction non développée ».
Pour chacune, relever : code présent, tests existants, contrôle navigateur, contrôle téléphone, preuve manquante.

- Fold7 : lecture écran verrouillé, contrôles média, pliage/dépliage sans perte de lecture ou de saisie.
- Notifications : réception PWA fermée et ouverture par clic. La réception simple est déjà confirmée.
- My Mind : fermeture en pleine frappe, conflit entre appareils, liens conservés après suppression d’un contenu.
- Variantes et Deepgram : écoute prolongée, transcription, sauts et progression indépendante ; le dernier test Deepgram était un court paragraphe.
- Qualité : relecture humaine de préparations, fidélité, accessibilité, absence de promotions, rendu des voix sur 10–20 minutes.
- Collecte : fenêtre réelle de 24 h de CPU / erreurs, doublons, flux en échec, cycle avec les chaînes ; quotas sur une semaine d’usage réel.
- Publicités dynamiques : comparaison des durées sur trois épisodes pour valider les seuils de synchronisation.
- Sécurité : `AUTH_DISABLED` reste actuellement à `true`. Préparer et tester le parcours complet avant sa réactivation, sans changer ce réglage pendant ces travaux.
- Recette hors ligne sur le téléphone après B ; les tests navigateur ne remplacent pas le mode avion physique.

## 6. Règles de collaboration

1. Une branche et un checkout distincts par intervenant ; éviter deux agents qui éditent le même dossier de travail. Préfixe Codex : `codex/`.
2. Avant le code, chaque intervenant annonce ses fichiers et ses interfaces. Un fichier partagé a un seul éditeur à un instant donné.
3. Codex centralise la réservation des numéros de migrations ; dernière migration livrée : `0012`. Opus ne réutilise pas un numéro sans coordination.
4. Évolution des contrats documentée, rétrocompatible et accompagnée de fixtures TS / Python ; intégration après accord technique commun.
5. Préserver les changements personnels non commités de `convert/`, notamment le travail vocabulaire. Aucun `git add .`, reset ou nettoyage global dans ce dépôt.
6. UI React / TypeScript / MUI v5 et React Query v5 ; garder le design actuel. Pas de Tailwind, de dépendance superflue ni de migration générale d’UI. Atelier : respecter l’architecture Python / JS existante.
7. Livrer des commits ciblés, tests appropriés, typecheck et build ; documenter les limites et les étapes manuelles.
8. Un seul responsable des déploiements et migrations de production : Codex pour ces vagues. Opus prépare une branche intégrable, sans déployer ni lancer de génération payante de production.
9. Fin de chantier : résumé des fichiers, contrat ou migration, commandes et résultats, limites, commit. Relecture croisée avant intégration et recette commune.

## 7. Réserve d’idées, sans engagement pour ces vagues

Éléments encore hors du périmètre V1 initial, à distinguer des lots à finir :

- IA à la demande dans My Mind : questions ou contre-arguments, avec quota ; évaluer l’intérêt d’un moteur local sur le Mac.
- Collections générales et historique des versions des notes. Les dossiers A répondent d’abord à la préparation de plusieurs sources.
- Partage Android « Partager vers Discover » depuis YouTube / Podcasts.
- Récits regroupés en plusieurs parties, retour éventuel d’articles RSS, envois multipart si les tailles le justifient.

Ni l’atelier oral ni le remplacement général de Heart par Chatterbox ne sont au programme : l’utilisateur a privilégié l’écoute et abandonné Chatterbox pour sa lenteur.

## 8. Message de démarrage à transmettre à Claude Opus

> Tu travailles sur Discover, PWA React/TypeScript/MUI v5, avec Worker Cloudflare et Atelier Python séparé. Lis `docs/PLAN_PARTAGE_CODEX_OPUS.md`, `docs/PHASE0_ARCHITECTURE.md`, puis le code existant. Ta première mission est le chantier B : téléchargement explicite et lecture hors ligne des versions préparées existantes, avec transcription, métadonnées, progression, suppression et espace utilisé. Codex travaille en parallèle sur A, les dossiers multisources. Commence par analyser l’existant et annoncer ton découpage et les fichiers partagés nécessaires. Travaille dans un checkout et une branche distincts. Privilégie de nouveaux modules `pwa/src/offline/` et coordonne les petits points d’intégration au lecteur/bibliothèque ; préserve Push et les notifications du Service Worker. Ne modifie pas les migrations, contrats, Worker ou Atelier sans coordination. Ne déploie pas, ne génère aucun audio payant et ne touche pas au travail vocabulaire non commité. Livre une branche avec commits ciblés, tests utiles, typecheck/build, limites et procédure de recette mode avion. Ne commence pas les autres chantiers de la liste pendant cette première mission.

Ce message est prêt à copier ; aucune conversation Claude n’a été créée ni contactée par ce document.

## 9. Idées validées par l’utilisateur le 19 octobre 2026

Validées, à planifier après A–F (ordre conseillé : I3 et I5, puis I1, puis I2 avec I9).

| ID | Idée | Remarques |
|---|---|---|
| I1 | Relier Discover aux 4 000 mots : part de mots connus avant de préparer, ajout d’un mot depuis la transcription avec sa phrase | Dépend du travail vocabulaire de `convert/`, à commiter d’abord par l’utilisateur |
| I2 | Préparation automatique par émission (ex. Daybreak, L’essentiel B1, téléchargée en Wi-Fi) | **Réserve de l’utilisateur : risque de gaspiller le crédit Deepgram.** Plafond par règle et par mois, estimation avant génération, voix Deepgram jamais automatique par défaut (Kokoro ou texte seul), pause automatique si non écouté |
| I3 | Basculer sur l’original au même passage (appui long), via `sourceSegments` | PWA seule |
| I4 | Écoute active : répéter une phrase, pause après chaque passage, ralentir une phrase | PWA seule |
| I5 | Enchaînement des téléchargements et minuterie « fin de l’épisode » | PWA seule, s’appuie sur B |
| I6 | Trois questions de compréhension générées à la préparation | Atelier + PWA |
| I7 | Niveau qui s’ajuste par émission (trop facile / juste / trop dur) | |
| I8 | Bilan de la semaine (minutes, mots, notes, passages), export NotebookLM | |
| I9 | Coûts visibles dans l’Atelier (Gemini, OpenAI, Deepgram) par préparation et par mois | Préalable à I2 |

Le 19 octobre 2026, Codex n’a plus de crédit : Claude Opus reprend le chantier A à partir du travail non commité laissé dans
`~/.codex/worktrees/dossiers-multisources` (migration 0013, module `worker/src/dossiers/`, contrats), sur la branche `opus/dossiers-a`.

État au 19 octobre 2026 (Claude Opus) : **A et B fusionnés dans `main` (8903ef6) et déployés** ; migration 0013 appliquée en
production après sauvegarde (export SQL table par table dans `../discover-backups/`, l'export complet D1 refusant la table FTS5,
et point Time Travel noté à côté). Atelier : commit `065dd5e` dans `convert/`. Restent : recette Fold7 du hors ligne (B, § 6 de
`OFFLINE_B.md`) et première vraie préparation de dossier dans l’Atelier ; prochains chantiers C puis D, E, F.

## 10. Décisions de l’utilisateur du 19 octobre 2026 (suite)

- **Voix** : Deepgram reste le moteur, y compris pour les préparations automatiques (plafond mensuel existant, repli Kokoro).
- **Préparation automatique par émission (I2 révisée)** : interrupteur par émission dans la PWA (Émissions) **et** dans l’Atelier
  (Podcasts) ; réglage par émission « L’essentiel 4 min » (défaut, ≈ 0,09 USD Deepgram par épisode) ou « Condensé 8 min »
  (≈ 0,19 USD), niveau B1 par défaut ; interrupteur général pour tout couper. Remplace les options figées actuelles
  (`automaticPreparation`, seule L’édito éco est concernée aujourd’hui). Essai par l’utilisateur, coupure possible ensuite.
- **I1 confirmée** : envoyer un mot de la transcription vers EnglishFluency avec sa phrase ; attend le commit du travail vocabulaire.
- **D confirmée** : lancer une préparation depuis le téléphone sans dépendre du Mac.
- **My Mind (dans C, en premier)** : type de note « Article » avec journal et lien, attribué comme tel dans les préparations et les
  dossiers (corrige la consigne actuelle qui présente toute note comme une réflexion personnelle) ; nettoyage au collage
  (cookies, « Lire aussi », légendes, retours à la ligne) avec annulation ; « Partager vers Discover » (Web Share Target) ;
  récupération du texte depuis un lien partagé, de préférence par l’Atelier, avec l’état « complet / partiel / inaccessible ».
  Aucun contournement de paywall, aucune utilisation des cookies de connexion de l’utilisateur.
- **Onglet « Articles »** (nouveau chantier, séparé d’Explorer qui reste podcasts) : The Guardian (Open Platform, texte complet),
  The Conversation US et France (RSS texte complet, licence libre), ProPublica (RSS texte complet). **franceinfo écarté**
  (extraction de pages jugée trop fragile). Flux à vérifier au début du chantier.

Ordre proposé : préparations automatiques par émission → type « Article » et suite de C → onglet Articles → D.
GLM 5.2 (agent avec accès au dépôt, comme Codex) : E, I3/I5, I9 selon des briefs à rédiger ; branches `glm/…`, migration 0014+
réservée par Opus, aucun déploiement ni génération payante.

## 11. Décision du 19 octobre 2026 : pas de préparation sans Mac

Après lecture de l'étude `docs/CODEX_D_ETUDE.md` (offre Workers payante 5 USD/mois + Containers + transcription Deepgram),
l'utilisateur **renonce au chantier D** : l'Atelier reste sur le Mac et reste le seul exécutant des préparations. Ne pas proposer
d'infrastructure cloud de préparation sans nouvelle demande explicite. L'étude reste comme référence.
État des autres chantiers : B, A, E, I3/I5, I9, C côté serveur (A2) et F livrés ; refonte de l'interface en cours par Opus
(étapes 1 à 3 en production : socle, cadre, Explorer en un seul fil, thème clair uniquement).
