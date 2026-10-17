# Lot 8 — File « À préparer »

Le bouton **Préparer en anglais** du détail d’un épisode ouvre les options : intégral, condensé ou essentiel ; A2 à C1 ou anglais non simplifié ; narration ou dialogue ; durée cible ; anglais fidèle pour une source française ; copie privée facultative. Le suivi est disponible sur l’épisode et dans Bibliothèque. Une demande active par épisode ; annulation et nouvelle tentative explicite après échec.

## Atelier sur Mac

Lancer `convert/lancer_atelier.command`, puis **À préparer · Discover** dans la barre de l’Atelier. Le consommateur démarre automatiquement avec l’Atelier si `config_discover.json` existe ; le bouton Arrêter le suspend. Ce fichier de configuration conserve le jeton hors de Git ; il n’est jamais exposé au navigateur.

Les enclosures sont téléchargées sous un nom calculé dans `fileToImport/.discover-queue/<episode-id>/`. Les adresses publiques sont résolues et épinglées pour chaque connexion, y compris après redirection. Les téléchargements sont bornés ; l’audio est normalisé par ffmpeg en mono, 24 kHz, 64 kbit/s. La transcription officielle SRT/VTT est privilégiée, avec repli sur MacWhisper local et détection des intervenants si le modèle la supporte. Sur le modèle Base installé, le traitement reprend explicitement sans détection et l’indique dans le cache source et dans l’Atelier. Audio et segments sont réutilisés après contrôle SHA-256. Les processus ffmpeg/MacWhisper s’arrêtent si le bail est perdu.

Le lot 8 produit une **source prête**, pas encore une adaptation B1. L’Atelier rend le bail sans pénalité avec `sourceReady: true`, laissant la demande `pending`, étape `source_ready`. Son consommateur `sourceOnly` passe alors aux autres demandes. Le lot 9 prendra ces demandes avec la prise normale, réutilisera les sources locales, générera et évaluera les versions puis les publiera. Aucune source seule n’est publiée automatiquement comme une adaptation achevée.

## Protocole

- `POST /api/episodes/:id/prepare` : options § 7.4 ; validation stricte, défaut B1, intégral jusqu’à 25 min et condensé au-delà. Les journaux Daybreak sont proposés en essentiel par la PWA.
- `GET /api/queue[?episode=<id>]` : 100 dernières demandes, sans jeton ni URL de source ; `DELETE /api/queue/:id` : annuler ; `POST /api/queue/:id/retry` : relancer explicitement un échec ou une annulation, compteur remis à zéro.
- `GET /atelier/queue` : suivi protégé par le jeton Atelier.
- `POST /atelier/queue/lease` : `{ owner, sourceOnly?: boolean }`, une prise atomique par `UPDATE … RETURNING`. `sourceOnly` exclut les sources déjà prêtes.
- `POST /atelier/queue/:id/heartbeat` : `{ leaseToken, stage }` ; 15 minutes renouvelées, signal au moins toutes les deux minutes.
- `POST /atelier/queue/:id/release` : `{ leaseToken, sourceReady?: boolean }`, rend la demande sans pénalité.
- `POST /atelier/queue/:id/fail` : `{ leaseToken, error, retryable }` ; au plus trois tentatives automatiques. Le cron et les lectures de file clôturent les baux expirés épuisés.
- Déclaration de publication : `queueItemId` et `leaseToken` ensemble, avec correspondance de la source. Les `PUT` de fichiers et le commit portent aussi **`X-Discover-Lease-Token`**, vérifié contre le bail courant. Une publication interrompue encore `uploading` peut être rattachée au nouveau bail de la même demande sans renvoyer les fichiers reçus.

Une demande annulée révoque immédiatement le bail. Les épisodes en file sont protégés de la rétention et du désabonnement. Un verrou local empêche deux processus Atelier d’utiliser simultanément le même bail enregistré sur le même Mac.

## Vérification

Tests Worker : prises concurrentes, doublons, validation des options, accès session/CSRF/Bearer, expiration, trois échecs, annulation, restitution sans pénalité, publication avec ancien/nouveau bail et protection des épisodes en attente. Tests Atelier : URL privées, redirections, taille bornée, reprise par empreinte, arrêt de sous-processus, revalidation après redémarrage et transmission du bail jusqu’au commit. Tests PWA : choix par défaut et libellé d’une source en attente d’adaptation.

Le parcours a été vérifié dans le navigateur intégré à 1280 px. Le contrôle de taille de ce navigateur n’a pas appliqué les tailles demandées ; la vérification aux dimensions pliée/dépliée et le test physique sur le Fold7 restent à effectuer.

Test réel isolé du 2026-10-17 : « Classic Stories: The Adventures of Huckleberry Finn » (BBC), demandé dans la PWA, reçu dans l’Atelier, téléchargé et normalisé à 64 kbit/s, mono, 24 kHz ; 17 segments MacWhisper produits. Le bail est rendu avec `source_ready`. Un lien de mesure Podtrac indisponible a aussi exercé les trois tentatives et l’affichage d’échec. Aucun épisode de contrôle ni demande de contrôle n’a été ajouté en production.
