# Lot 9 bis — Temps réel et notifications

## Utilisation

Pendant la consultation, la PWA reçoit les changements de préparation en WebSocket. L’Atelier continue ses appels HTTP existants : aucune clé supplémentaire ni nouvelle connexion ne sont nécessaires sur le Mac. Les réglages affichent **Suivi en direct** lorsque la connexion est établie.

Sur le téléphone : **Réglages → Préparations et notifications → Activer sur cet appareil**, puis accepter la demande du navigateur. L’activation est propre à chaque appareil. **Envoyer une notification de test** permet de vérifier sa réception, y compris après fermeture de Discover. La désactivation retire l’abonnement du serveur et du navigateur.

Notifications : préparation prête, relecture nécessaire sur le Mac, échec définitif. Les étapes intermédiaires ne produisent pas de notification. Les messages ne contiennent ni titre d’épisode, ni extrait, ni jeton. Leur clic ouvre Bibliothèque ; le test ouvre Réglages. Une PWA visible sur l’appareil reçoit les événements en direct et n’est pas notifiée en plus, sauf demande explicite de test.

## Architecture

- **D1 reste la référence** pour la file et ses baux. La migration `0005_events_push.sql` ajoute une outbox via des triggers INSERT/UPDATE : l’événement est enregistré dans la même transaction que le changement. Les seuls renouvellements du bail, sans changement d’étape, ne créent pas d’événement.
- Le Worker réveille le Durable Object après les écritures. L’échec de diffusion ne transforme pas une préparation réussie en échec. Le cron existant assure la reprise d’un réveil manqué ; aucun nouveau cron n’est créé.
- Un Durable Object `PreparationEvents`, avec stockage SQLite et WebSocket Hibernation, coordonne la bibliothèque **personnelle**. La file de travail ne migre pas vers cet objet. Une future application multiutilisateur devra partitionner le coordinateur par propriétaire.
- Les événements WebSocket ne portent que des invalidations. La PWA relit les requêtes React Query concernées : file, épisode, bibliothèque, Explorer et contenu. Une reconnexion récupère donc l’état courant sans dépendre de la réception de tous les messages précédents.
- L’application ferme sa connexion en arrière-plan. Reconnexion avec temporisation, récupération au retour au premier plan et fermeture des connexions muettes. Le suivi périodique de 15 secondes reste le repli lorsque le direct n’est pas disponible.

## Notifications Push

Le Service Worker personnalisé conserve le précache des fichiers de la PWA et ajoute `push` / `notificationclick`. Les routes API et Atelier restent exclues du fallback de navigation. Le téléchargement hors ligne des audios reste au lot 11.

Les envois utilisent `@block65/webcrypto-web-push` (Web Crypto, AES128GCM et VAPID), sans service applicatif tiers ajouté. Les abonnements et les livraisons sont persistés dans D1. Les états prêts/à relire/échoués créent des livraisons dédupliquées par événement et appareil. Une transition suivante annule les anciennes notifications encore en attente pour cette demande.

Un maximum de cinq livraisons est traité par passage. Les erreurs réseau, HTTP 429 et 5xx sont reprises trois fois au maximum avec temporisation. Les HTTP 404/410 retirent les abonnements périmés. Les notifications de préparation expirent après une heure ; un test après cinq minutes. Les événements et livraisons terminés sont nettoyés après sept jours. Une ambiguïté réseau peut entraîner une nouvelle livraison ; le tag de notification stable limite les doublons affichés.

Les paramètres VAPID sont des secrets Wrangler : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. La clé publique seule est exposée à la PWA. La paire doit rester stable ; une rotation peut demander un nouvel abonnement des appareils. Les valeurs locales sont dans `.dev.vars`, ignoré par Git.

## Accès et confidentialité

Les routes suivent le mode d’authentification existant de Discover (`AUTH_DISABLED` conservé). Avec connexion active, session valide et contrôles CSRF sont requis ; les connexions et les abonnements sont liés à cette session. Une révocation ou un changement de `SESSION_EPOCH` invalide l’accès lors de la diffusion suivante.

L’appareil est identifié par un cookie aléatoire HttpOnly, Secure et SameSite=Strict ; seul son HMAC est stocké. Les WebSockets exigent une origine identique ; aucun jeton n’apparaît dans leur URL. Les abonnements ne sont jamais listés au navigateur. La suppression est limitée à l’appareil courant. Les destinations Push sont limitées aux services des navigateurs pris en charge, sans redirection ; la clé ECDH est validée avant enregistrement. Maximum : dix appareils abonnés ; un test par minute et appareil.

## Vérification

Tests dans le runtime Cloudflare : transitions atomiques, absence d’événements de simple renouvellement, notifications après restitution du bail, expiration des baux épuisés, accès session/origine/appareil, diffusion sans contenu privé, révocation, reprise d’outbox, notifications périmées, chiffrement et signature VAPID, abonnements expirés, tentatives bornées, propriété de l’abonnement, clés invalides et limitation du test.

Tests PWA : regroupement des événements, reconnexion, mise en arrière-plan, connexion muette, démontage pendant une requête, notification visible avec payload invalide et navigation du clic limitée à Discover.

Parcours local réel : réglages « Suivi en direct », demande depuis la PWA, appels Atelier successifs vers `tts` puis restitution `review`, affichage immédiat des deux états sans rechargement. Aucune préparation ou souscription de contrôle n’est créée en production.

L’autorisation Android et la réception d’une notification sur le Fold7 sont confirmées par l’utilisateur le 18 octobre 2026. La réception application fermée et le clic sur la notification restent à vérifier sur le téléphone. Aucune autorisation de notification n’est accordée automatiquement par le code.

Validation automatisée : **171 tests Worker, 37 tests PWA**, TypeScript, build et déploiement à blanc réussis. Migration appliquée en production ; secrets VAPID configurés ; version Worker finale `37baa3d8-a1ab-4f7d-b6ee-f5300588c049`. La page de réglages en production affiche « Suivi en direct » et « Activer sur cet appareil » ; une requête WebSocket complète d’origine étrangère est refusée avec `403 csrf_origin`.

Références : [WebSocket Hibernation Cloudflare](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [bibliothèque Web Crypto Push](https://github.com/block65/webcrypto-web-push).

## Correctif d’envoi Push du 18 octobre 2026

Le premier essai sur les appareils a révélé une incompatibilité réelle : `redirect: 'error'` est accepté par les types et par notre transport simulé, mais refusé par le runtime workerd avant l’appel réseau. Les envois restaient donc en reprise.

L’envoi construit désormais une véritable `Request`, en mode `manual`. Aucune redirection n’est suivie ; une réponse 3xx termine l’essai. Les tests construisent également une Request native et vérifient que la livraison est effectivement terminée, ainsi que le refus de transmettre la requête à une cible de redirection. Les journaux conservent le statut HTTP et la phase/type d’erreur, sans endpoint, clé ni contenu.

Validation : **172 tests Worker**, types Worker/PWA réussis ; Worker `af9ea94e-8a30-49b0-bcc9-e712ba41be52`. Deux essais demandés par l’utilisateur ont été relancés après correction : le service Push Google a accepté chacun avec **HTTP 201**, dès la première tentative. L’utilisateur a ensuite confirmé la réception sur son Fold7.
