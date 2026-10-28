# Chaînes YouTube dans Explorer

## Utilisation

Explorer → **Abonnements** → **Ajouter** : coller une adresse de chaîne (`https://www.youtube.com/@arte`, `/channel/UC…`, ancienne URL `/user/…` ou `/c/…`), un `@identifiant` ou un identifiant `UC…`. Un flux officiel `/feeds/videos.xml?channel_id=UC…` est aussi accepté.

L’aperçu affiche la chaîne et trois vidéos récentes. Choisir la langue et la catégorie, puis **Suivre**. La langue est à confirmer : elle n’est pas fournie dans le flux YouTube. Le filtre de titre facultatif fonctionne comme pour les podcasts.

Explorer propose **Tout / Podcasts / YouTube**, puis un filtre par chaîne dans YouTube. Ouvrir une vidéo permet de la sauvegarder, de créer une note liée, de voir l’original sur YouTube ou de choisir **Préparer en anglais**. Après publication, ses versions sont accessibles dans le détail et dans la Bibliothèque.

Le suivi seul ne déclenche aucune préparation ni appel à une IA. La préparation utilise l’Atelier existant sur le Mac ; la préparation sans Mac et le choix Deepgram avec budget ne font pas partie de cette livraison.

## Collecte et conservation

- Flux Atom publics YouTube ; aucune clé Data API et aucun accès au compte YouTube personnel.
- Cron existant : une source par minute, toutes sources confondues. À 38–50 abonnements, le tour prend environ 38–50 minutes ; les erreurs répétées sont espacées comme pour les podcasts.
- Limite actuelle de **50 sources actives**, podcasts et chaînes confondus.
- Seules les publications des **24 dernières heures** sont collectées, toutes catégories confondues ; une date absente, invalide ou future est ignorée. Le plafond de dix vidéos par chaîne reste applicable.
- La préparation automatique se limite à la dernière vidéo publiée dans cette fenêtre de 24 heures.
- Le cron purge les anciennes vidéos et les articles, même sans nouveauté ou si le flux échoue. Les demandes en attente ou à bail expiré sont annulées avant suppression de leur source.
- Les vidéos sauvegardées, les contenus déjà préparés, les articles transformés en notes et les baux encore actifs sont conservés. Un article dont un dossier attend encore le texte complet reste disponible jusqu’à sa capture.
- Les articles suivent la même fenêtre de 24 heures, avec un plafond supplémentaire de 60 articles par source. Aucune migration de schéma n’est nécessaire ; le nettoyage débute au premier cron après déploiement.
- Pas d’import de tout l’historique d’une chaîne. Le flux ne contient qu’une sélection récente, peut contenir des Shorts et ne donne pas la durée des vidéos.
- Pas de lecture directe du lien YouTube dans le lecteur audio : **Voir sur YouTube** ouvre l’original ; les versions préparées utilisent le lecteur existant.

## Intégration

Migration additive `0011_youtube_channels.sql` : `shows.source_type` (podcast par défaut), `shows.channel_id`, `episodes.video_id`. Les abonnements podcasts existants sont conservés.

Les routes `/api/shows/resolve`, `/api/shows`, `/api/shows/:id`, `/api/explorer` et `/api/episodes/:id` restent communes aux deux types. Le filtre Explorer `sourceType=podcast|youtube` est validé côté serveur. L’abonnement YouTube stocke l’URL canonique du flux correspondant à son identifiant.

Une vidéo suivie est envoyée avec `kind=youtube` et son identifiant de vidéo dans la file existante : même déduplication qu’un lien collé dans la PWA ou l’Atelier. Titre, langue et catégorie sont transmis au Mac. La publication rattache les vidéos suivies au contenu ; une vidéo déjà préparée avant la collecte est rattachée lors de son insertion.

Résolution des handles : lecture de la page de chaîne plafonnée à 2 Mo, extraction HTML du lien RSS/canonique. Pas d’extraction d’identifiants provenant des vidéos recommandées. Les erreurs YouTube sont affichées ; l’adresse `/channel/UC…` sert de solution de repli.

La requête de page utilise un refus anonyme des cookies facultatifs (`SOCS=CAI`) pour éviter l’écran de consentement. Si le flux officiel sur `www.youtube.com` répond 404 ou 5xx, l’aperçu et la collecte réessaient une seule fois sur `youtube.com`, avec les mêmes paramètres et en-têtes conditionnels. L’adresse du flux enregistrée reste canonique. Les erreurs persistantes restent visibles ; les réponses 403/429 ne déclenchent pas de nouvelle tentative immédiate.

Contrôle du 20 octobre 2026 : les huit pages signalées exposent leur identifiant de chaîne. Sept flux répondent directement ; BFM Business renvoie 404/500 sur `www.youtube.com`, mais répond sur `youtube.com`. Les tests utilisent les balises canoniques/RSS relevées sur ces pages : France24_en, SamouraiDansant, BFMBusiness, aktionnaire, LeDessousdesCartesARTE, romainmolina4473, SciShow et siliconcarnepod.

Le contrôle des aperçus avant déploiement confirme le caractère intermittent : sept aperçus répondent HTTP 200 (dont BFM Business), tandis que SciShow échoue sur un flux HTTP 500. Aucun abonnement n’a été créé pendant ces contrôles. Après déploiement du correctif, l’aperçu SciShow répond HTTP 200.

## Vérifications

- Correctif du 20 octobre 2026 : 364 tests Worker réussis, dont 39 cas dans la suite YouTube ; vérification TypeScript Worker réussie. Couverture du secours 404/5xx, des erreurs persistantes, des réponses sans nouvelle tentative et de la conservation des en-têtes conditionnels en collecte.

- 219 tests Worker, dont 20 nouveaux cas YouTube et un cas de publication/rattachement/suppression ; résolution HTML vérifiée avec les métadonnées placées après le head, comme sur les pages réelles, et par TypeScript.
- 47 tests PWA, TypeScript et build réussis.
- Parcours local isolé : ajout réel de `@arte`, collecte de dix vidéos, filtre YouTube, détail et mise en file sans génération. Contrôles navigateur téléphone (390 px) et tablette (880 px). Les tests ARTE ne créent aucun abonnement ni demande en production.
- Vérification sur le Fold7 physique à réaliser par l’utilisateur.

## Suite convenue

1. Intégration Deepgram avec cache, estimation et budget plafonné ; Heart en secours. Aucun changement de moteur dans cette livraison.
2. Dossiers multisources : sélection manuelle de vidéos/podcasts complémentaires, préparation unique avec sources par passage, rapprochements et désaccords explicités. À développer ; aucun bouton ne prétend aujourd’hui réaliser cette synthèse.
3. Préparation cloud ponctuelle, distincte du suivi YouTube : tous les traitements nécessaires devront pouvoir se passer du Mac.

## Déploiement

Migration 0011 appliquée à la base de production `discover`. Version Worker finale : `6b8057f9-8847-4c02-a4c7-8fce95d706db`.

Correctif YouTube déployé le 20 octobre 2026 : version `a461aaa5-22eb-4e83-a98c-09735f9f39cb`. Build PWA et empaquetage Worker réussis ; aperçu SciShow vérifié en production.

À la demande de l’utilisateur, les dernières publications de l’onglet Vidéos des huit chaînes ont été mises en préparation via l’Atelier : A2, narration, condensé de huit minutes si la source dépasse 480 secondes, intégral sinon. Les huit demandes et leurs options ont été relues dans la file distante. Cinq versions condensées (SciShow, Romain Molina, SamouraiDansant, Aktionnaire, Silicon Carne) et trois intégrales (ARTE, BFM Business, France 24). Au contrôle, l’Atelier est actif mais attend sa reprise automatique après quota Gemini et erreur OpenAI HTTP 503 ; les huit demandes restent en attente.

Contrôle de production sans création : `@arte` et l’identifiant canonique de la chaîne renvoient un aperçu HTTP 200 avec les trois dernières vidéos ; l’Explorer podcasts reste accessible. Les 49 abonnements existants (38 actifs) sont conservés, aucune chaîne de test n’est enregistrée.
