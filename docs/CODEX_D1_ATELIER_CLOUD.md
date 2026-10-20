# D1 — Premier Atelier manuel sans Mac

20 octobre 2026. Branche `codex/atelier-cloud`, worktree `/private/tmp/discover-mymind-codex-atelier-cloud`, base `main` : `4eed170`.

**Code et recette locale uniquement. Aucune migration distante, aucun déploiement, aucune clé réelle copiée, aucun appel IA/TTS payant.**
L'utilisateur fera la recette qualitative. L'activation de ce lot demande encore son accord explicite.

## Périmètre livré

Depuis « Préparer en anglais » d'une note ou d'un lien YouTube, choisir **Préparer sans Mac**. Le parcours Mac et ses options restent disponibles.

- Note/article : uniquement le texte déjà enregistré et synchronisé dans My Mind, de 100 à 20 000 caractères. Le texte est figé au devis.
- YouTube : vidéo publique, traitement terminé, hors direct/première à venir, de 10 secondes à 15 minutes. Métadonnées contrôlées par YouTube Data API v3 avant toute génération. Aucun téléchargement yt-dlp, cookie ou contournement.
- Narration anglaise « L'essentiel », cible 4 minutes, niveaux A2/B1/B2/C1 ou anglais non simplifié ; traduction française de chaque passage ; voix Deepgram Aura-2 Thalia.
- Une source courte donne un résultat plus court : jamais de remplissage pour atteindre quatre minutes. Limite déterministe de 650 mots et 8 000 caractères anglais ; audio final au maximum 7 minutes, sinon arrêt sans régénération.
- Le téléphone peut fermer l'application après l'enregistrement de la demande. La file affiche **Sans Mac** et l'étape ; le contenu final rejoint la Bibliothèque et le lecteur habituel.
- Le contrôle éditorial est un appel séparé. Le choix existant d'auto-publication est conservé : `review`/`rejected` sont explicitement marqués `autoPublished`, donc affichés **non relus**. Aucune approbation humaine inventée.

Limites de ce premier lot : source n'ayant pas encore de versions ; pas de podcast cloud, dossier, dialogue, version fidèle intégrale, copie de l'original, quiz généré ou transfert cloud/Mac. Ces options sont refusées avant réservation, elles ne sont pas ignorées silencieusement. Pour un article, passer par son texte enregistré dans My Mind ; aucune acquisition universelle d'article n'est ajoutée.

## Choix d'architecture et fichiers

Le document D0 recommandait Containers/Python pour réutiliser l'intégralité du préparateur. Ce lot borné emploie un **Workflow TypeScript** avec appels HTTP directs : il ne porte pas le pipeline Python complet. Le MP3 natif Deepgram permet ici d'éviter ffmpeg et un conteneur en production. Aucun binding Workers AI, aucune dépendance ajoutée.

| Ensemble | Responsabilité |
| --- | --- |
| `worker/src/cloud/source.ts`, `types.ts` | Éligibilité, options bornées, capture de source et attribution |
| `routes.ts`, `store.ts` | Session propriétaire, devis, consentement, réservation transactionnelle |
| `operations.ts`, `transport.ts` | Journal avant HTTP, réponses bornées, checkpoints R2, erreurs sans corps fournisseur |
| `gemini.ts`, `editorial.ts` | Comptage préalable, transcription, adaptation EN/FR, contrôle distinct, validation déterministe |
| `speech.ts`, `mp3.ts` | Deepgram REST direct, format audio vérifié, assemblage et bornes de passages |
| `workflow.ts`, `dispatch.ts`, `cleanup.ts` | Étapes durables, reprise du dispatch, arrêt et rétention |
| `publish.ts` | Réemploi de déclaration/envoi/commit avec les gardes de publication existantes |
| `worker/src/queue/*`, `routes/queue.ts`, `index.ts`, `env.ts`, `wrangler.jsonc` | Destination cloud séparée, protection des mutations, Workflow et cron |
| `pwa/src/cloud/*` | Service API, hook React Query v5, volet, états et tests |
| `pwa/src/queue/*`, `mind/NotePreparation.tsx` | Entrée sans Mac, libellés, absence de retry cloud trompeur |

Les composants utilisent le kit Discover existant, conformément au brief spécifique vague 9 (MUI retiré de cette PWA). Thèmes clair et sombre conservés. Les constantes de niveaux sont sorties du dialogue pour éviter une dépendance circulaire.

### Migration préparée : 0025

`worker/migrations/0025_cloud_atelier.sql`, **testée seulement en D1 local** :

- `prepare_queue.executor` vaut `mac` par défaut ; les anciennes demandes restent Mac.
- `cloud_quotes` : source figée, mois et validité dix minutes.
- `cloud_runs` : intention unique par devis, enveloppe, état, bail et purge.
- `cloud_operations` : opération envoyée/complète, clé de résultat ; unicité `(run_id, operation)`.
- `cloud_guards` : assertion transactionnelle pour plafond et validité du devis.

Le Mac ne peut prendre aucune ligne `executor='cloud'`, même par identifiant ou après expiration. Une source ne peut avoir qu'une préparation active, quelle que soit sa destination. Un double clic sur le même devis renvoie le même identifiant et réserve une seule enveloppe. Le retrait de l'historique conserve le registre budgétaire.

## Coûts et autorisation

**Valeurs initiales proposées, non activées : 1 USD réservé par demande, 10 USD/mois UTC.** Le plafond mensuel est configurable côté serveur (`CLOUD_MONTHLY_USD`, de 0 à 100) ; une valeur invalide ferme le budget. Il est distinct du budget de l'Atelier Mac et ne couvre pas l'infrastructure ni les autres usages des comptes fournisseurs.

Le premier lot garde intégralement l'enveloppe de 1 USD, y compris après succès, échec, annulation ou absence d'appel facturé. Ce suivi est volontairement conservateur : **ce n'est ni la dépense réelle ni une facture rapprochée**. À 10 USD, dix préparations autorisées épuisent donc le budget, même si la facture réelle est inférieure. Pas de restitution ou relèvement automatique ; un suivi fin de consommation reste à ajouter ultérieurement.

Les prix retenus au 20 octobre 2026 sont ceux de Gemini 3.1 Flash-Lite et Aura-2 :

- Gemini : borne conservatrice d'entrée 0,50 USD/M tokens (couvre l'audio), sortie/pensée 1,50 USD/M tokens.
- Chaque appel vérifie `countTokens <= 300 000` ; sortie limitée à 16 384 tokens, trois générations maximum, aucun outil externe, aucune recherche payante ni modèle de secours.
- Deepgram : 0,03 USD/1 000 caractères ; tous les passages sont validés avant la première voix, au plus 8 000 caractères au total, sans essai supplémentaire.
- Borne calculée : `3 × (300000 × 0,50 + 16384 × 1,50) / 1000000 + 8000 × 0,03 / 1000 = 0,763728 USD`. Marge dans l'enveloppe de 1 USD. À revérifier si tarifs ou modèle changent.

Références : [prix Gemini](https://ai.google.dev/gemini-api/docs/pricing), [prix Deepgram](https://deepgram.com/pricing). Le serveur ne prétend pas plafonner la facture globale du fournisseur ou celle de Cloudflare.

Le devis n'appelle pas Gemini/Deepgram. La vérification YouTube consomme du quota YouTube Data API. La réservation D1 précède le Workflow et les appels IA. La confirmation de l'enveloppe est explicite dans le volet ; les mutations React Query ne sont pas réessayées automatiquement.

## Durabilité, sécurité et arrêt

La connexion propriétaire est **exigée même avec `AUTH_DISABLED=true`**. `/api/cloud/auth` réutilise la vraie vérification de phrase, le délai et le limiteur d'essais ; cookie Secure/HttpOnly/SameSite strict. La phrase n'est pas conservée dans le stockage du navigateur. « Verrouiller l'Atelier » révoque la session ; si la connexion de toute l'app est réactivée, cette session est commune. Les contrôles CSRF restent actifs. Les annulations/retraits cloud par les anciennes routes publiques exigent aussi cette session.

Le Worker HTTP enregistre l'intention puis crée une instance Workflow dont l'identifiant est celui de la demande. Le cron peut reprendre un dispatch perdu avec **le même identifiant**. Aucune préparation longue dans le HTTP ou `waitUntil`. Bail cloud borné à une heure ; à expiration, arrêt sans reprise Mac. L'annulation invalide le bail en D1 ; elle ne peut pas rembourser/interrompre un appel déjà transmis. Un contrôle supplémentaire entre le comptage gratuit et `generateContent` empêche un achat après une annulation survenue pendant ce comptage.

Avant chaque envoi, une opération unique est inscrite `sent`. Son résultat validé est stocké dans R2, puis l'opération passe `complete`. Une étape rejouée retrouve le checkpoint ; une opération `sent` sans résultat **n'est jamais renvoyée automatiquement**. Cela peut arrêter un travail sans qu'un fournisseur ait réellement reçu l'appel : l'ambiguïté est assumée pour éviter un second achat. Les étapes payantes du Workflow ont zéro retry ; aucun fallback IA/TTS. Les boutons retry existants refusent les demandes cloud. Une nouvelle préparation est une nouvelle autorisation, pas une reprise financière automatique.

Les appels vont à des domaines fournisseurs fixes ; clés en en-têtes, redirections interdites, délais et tailles bornés. Seul un identifiant YouTube validé construit l'URL vidéo. Les données de source sont signalées comme non fiables dans les prompts ; leurs instructions ne remplacent pas celles du préparateur. Les schémas et validations de publication restent appliqués.

Le bouton Annuler de la file reste le moyen d'arrêter un travail cloud. Mettre `CLOUD_ATELIER_ENABLED=false` bloque les nouvelles demandes ; ne pas compter sur une nouvelle configuration de déploiement pour arrêter immédiatement une ancienne instance Workflow : annuler ses lignes actives en D1 via la file.

Les devis expirés sont purgés ; les copies de travail R2 et les snapshots terminaux D1 sont retirés après trente jours, au passage horaire du cron (minute 31), même si les générations sont désactivées. Les enveloppes et clés d'anti-doublon sont conservées. Les médias publiés suivent la rétention existante des publications.

## Audio et fidélité : limites de preuve

YouTube est envoyé à Gemini comme `fileData.fileUri` avec MIME vidéo, pas comme une simple URL dans un prompt. [Documentation vidéo Google](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding). La capacité documentée ne garantit ni l'accès à chaque vidéo ni une transcription exhaustive ; la recette réelle reste nécessaire. Aucune transcription originale n'est étiquetée comme vérifiée. Les passages source ont des temps `null`, sans audio original ni faux timings MacWhisper.

Chaque passage anglais est synthétisé séparément. La sortie demandée est le format [MP3 Deepgram documenté](https://developers.deepgram.com/docs/tts-media-output-settings) : 22 050 Hz non configurable, 48 kbit/s, MPEG-2 Layer III. L'assembleur retire ID3 et les blocs de durée Info/Xing, accepte leur débit particulier, puis exige les trames audio au format demandé. Bornes cumulées à partir des échantillons encodés (576/trame), arrondies en millisecondes ; aucune estimation par nombre de mots. Ce sont des bornes de passages générés, pas des mots de la vidéo originale. Une réponse de format inattendu arrête le traitement.

Les tests ne prouvent pas la qualité de la voix réelle, la fidélité de Gemini ou la lecture native Android de toutes les réponses fournisseurs. Aucun crédit fournisseur n'a été utilisé.

## Vérifications

Complément après signalement utilisateur : voir `CODEX_D1_CITATIONS.md` pour les protections contre les identifiants lus à voix haute, la reprise des anciens checkpoints et les résultats actualisés (1 221 tests). Le tableau ci-dessous consigne la validation initiale de `6f7fe3d`.

| Périmètre | Résultat |
| --- | --- |
| Worker | `npm test` : 365 tests ; TypeScript réussi ; types Wrangler régénérés |
| PWA | `npm test` : 224 tests ; TypeScript et build réussis |
| Atelier isolé | 303 tests ; copie `/private/tmp/convert-codex-v9-5`, contrats pointant sur ce lot ; aucune action sur l'Atelier actif |
| EnglishFluency Worker | 226 tests |
| EnglishPWA | 90 tests ; `tsc -b`, lint et build réussis |
| Packaging Worker | `wrangler deploy --dry-run` réussi, aucun déploiement |

Total : **1 208 tests**. Le build PWA conserve son avertissement existant sur la taille du bundle principal. Les erreurs du scénario TTS interrompu sont attendues dans les journaux du runtime Workflow de test.

Les tests cloud couvrent notamment : session/CSRF en accès libre, consentement, devis périmé, budget concurrent, double clic, dispatch perdu, ancien Mac, annulation pendant countTokens, mois suivant, achat incertain, retrait d'historique, rétention, source courte, provenance invalide, vrai MP3 avec Info à débit distinct, Workflow réel simulé jusqu'au commit, et échec TTS sans deuxième envoi ni publication.

Recette navigateur locale avec API **entièrement fictive** à 375 × 812 et 720 × 1000, clair/sombre : accord visible après défilement sur téléphone, action fixe, pas de débordement horizontal, bouton de lancement activé seulement après accord. Captures : `/private/tmp/atelier-cloud-375-clair.png`, `/private/tmp/atelier-cloud-375-sombre.png`, `/private/tmp/atelier-cloud-720-clair.png`, `/private/tmp/atelier-cloud-720-sombre.png`. Le harnais temporaire a été retiré.

Essai codec hors réseau : un sinus 440 Hz de 0,3 seconde généré localement par ffmpeg, trois fragments assemblés. Compte attendu et réellement décodé : **24 192 échantillons**, soit **1 097,142857 ms**. Petite fixture réelle versionnée ; les voix des tests d'intégration sont des trames structurelles factices, distinctes de cette preuve codec.

## Mise en service à autoriser séparément

1. Valider ce lot, les limites ci-dessus et les plafonds proposés. Vérifier la disponibilité et la facturation du compte Cloudflare Workflows ; infrastructure séparée. [Règles Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).
2. Intégrer la branche sans écraser les modifications YouTube présentes sur `main` ; aucun fichier de ce travail utilisateur n'est inclus ici.
3. **Avant 0025 en production**, appliquer intégralement `BRIEFS_CODEX_VAGUE9.md` § 6 : bookmark Time Travel `discover`, export table par table compatible FTS5 dans `discover-backups`, vérification de la sauvegarde, puis migration distante et contrôle de la liste. Aucun export de production n'a été nécessaire pour développer ce lot.
4. Configurer des secrets dédiés `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `YOUTUBE_DATA_API_KEY` (YouTube Data API v3 activée). Aucune clé dans le chat ou Git. Garder les valeurs via les procédures de secrets/versionnement Wrangler ; `wrangler secret put` peut déployer immédiatement, donc ne pas l'employer avant l'accord du lot.
5. Construire et déployer Discover selon le § 6 ; création du binding `CLOUD_PREPARATION` / Workflow `discover-cloud-preparation`. L'activation exige de passer explicitement `CLOUD_ATELIER_ENABLED` à `true`. Le dépôt le laisse à `false`.
6. L'utilisateur teste une note courte connue puis une vidéo publique <=15 min, avec/sans sous-titres, ferme l'app après confirmation et vérifie le résultat Mac éteint : contenu, traduction, prononciation, transitions audio, surlignage, reprise et annulation. Contrôler séparément les factures fournisseurs et le budget engagé affiché.

Le lot ne change pas la branche `feat/lot1` de `convert/`. Les services locaux et les modifications non commitées de `main` sont conservés.
