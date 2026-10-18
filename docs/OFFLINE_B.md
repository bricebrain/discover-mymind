# Chantier B — Bibliothèque hors ligne (Claude Opus)

Branche `opus/offline-b` (worktree `../discover-mymind-opus`), partie de `7844f54`.
Aucune modification du Worker, des migrations, des contrats de publication ou de l'Atelier. Aucun déploiement.

## 1. Analyse de l'existant

- **Service Worker** (`pwa/src/sw.ts`) : précache Workbox de toute l'app (JS, CSS, polices woff2, icônes) et
  `NavigationRoute` vers `index.html`. L'app shell s'ouvre déjà hors ligne : **`sw.ts` n'est pas modifié**,
  Push, clic notification, précache et navigation restent tels quels.
- **Lecteur** (`PlayerProvider`) : un seul `HTMLAudioElement`, `track.src` fourni par `variantTrack`, progression
  identifiée par `audioRef` (sha256 de l'audio R2). Un audio local avec le même sha256 garde donc la même progression.
- **Contenus** : `GET /api/contents/:id` (détail + variantes), segments et audio via
  `/api/contents/:id/variants/:key/(segments|audio)?publication=…` ; le détail expose `audio.sha256`.
- **Progression** : `PUT /api/progress` (dernier écrit gagne, horodatage serveur) ;
  `GET /api/progress/...` renvoie `updatedAt`, suffisant pour une synchronisation sans changer le Worker.
- **Blocage hors ligne actuel** : `App.tsx` attend `GET /api/auth/session` ; hors ligne la requête échoue et
  l'app reste sur une alerte. Il faut une ouverture hors ligne contrôlée.

## 2. Choix techniques

- **Stockage** : IndexedDB (`idb`, déjà dépendance), base `discover-offline` séparée de My Mind :
  `downloads` (métadonnées, instantané du détail et segments), `audio` (Blob), `progress` (positions locales + envois en attente).
  Pas de Cache Storage : on évite de toucher au Service Worker.
- **Lecture audio** : `URL.createObjectURL(blob)` créé au démarrage pour chaque téléchargement complet
  (Chrome garde les gros Blob sur disque, pas en mémoire) ; recherche dans la piste native.
- **Validation** : taille annoncée + SHA-256 recalculé = `audio.sha256` du détail. L'état `complete` est écrit
  dans la même transaction que le Blob ; un téléchargement interrompu redevient `interrupted` au démarrage.
- **Nouvelle publication** : l'audio local n'est utilisé que si son sha256 est celui de la version affichée ; sinon
  lecture en ligne et mention « téléchargement d'une ancienne publication — mettre à jour ». Hors ligne : l'instantané
  téléchargé est affiché tel quel.
- **Progression** : chaque sauvegarde est aussi écrite localement. Hors ligne (ou échec réseau), elle part dans une
  file d'envoi. Au retour du réseau : pour chaque cible, on lit la progression serveur ; si le serveur a une
  écoute **plus récente** (autre appareil) on la garde, sinon on envoie la position locale. Les horloges client et
  serveur peuvent différer de quelques secondes : limite acceptée et documentée.
- **Exclusions** : flux officiels externes (`publisher_stream`) non téléchargeables dans cette livraison ;
  une version texte seul se télécharge (segments uniquement).
- **Concurrence entre onglets** : `navigator.locks` par version + `BroadcastChannel` pour rafraîchir l'état.
- **Espace** : `navigator.storage.estimate()` avant téléchargement, `persist()` demandé au premier téléchargement,
  `QuotaExceededError` traité. Éviction du navigateur : métadonnées et fichiers disparaissent ensemble ; un Blob
  absent ou de mauvaise taille marque la version « fichier absent — retélécharger ».
- **Session** : déconnexion explicite ou session refusée (401) en ligne ⇒ purge complète des téléchargements.
  Hors ligne, l'app s'ouvre uniquement si des téléchargements existent ; une révocation distante n'est découverte
  qu'au retour du réseau (limite inhérente).

## 3. Fichiers

Nouveaux (propriété Opus) : `pwa/src/offline/*` (services, hooks, composants, tests).

Fichiers partagés modifiés, par petits points d'intégration — **à valider par Codex avant intégration** :

| Fichier | Changement |
|---|---|
| `pwa/src/app/App.tsx` | `Gate` : ouverture hors ligne si erreur réseau et téléchargements présents ; initialisation du module offline |
| `pwa/src/api/contents.ts` | `useContent` / `useContentSegments` : repli sur l'instantané local (et segments locaux en priorité) |
| `pwa/src/pages/LibraryPage.tsx` + `library/useLibraryNavigation.ts` | onglet « Téléchargements » |
| `pwa/src/content/variants.ts` | `variantTrack` : source audio locale si même sha256 |
| `pwa/src/api/progress.ts`, `pwa/src/player/PlayerProvider.tsx` | progression locale + file d'envoi |
| `pwa/src/api/auth.ts` | purge des téléchargements à la déconnexion |
| `pwa/src/app/Shell.tsx` | bandeau « hors ligne » |
| `pwa/src/pages/ContentPage.tsx`, `components/PreparedEpisode.tsx` | bouton de téléchargement de la version affichée |

Interfaces publiques du module : `initOffline()`, `useDownloads()`, `startDownload(detail, variant)`,
`removeDownload(key)`, `offlineAudioUrl(audioRef)`, `offlineDetail(contentId)`, `offlineSegments(publicationId, key)`,
`saveProgressWithOutbox(body)`, `localProgress(track)`, `purgeOffline()`.

## 4. Livraison

Commandes (dans `pwa/`) : `npx tsc --noEmit -p .` ✓, `npx vitest run` ✓ (62 tests, dont 15 pour `offline/`), `npm run build` ✓.
`sw.ts` inchangé : précache, navigation, Push et clic notification intacts.

Tests unitaires (`offline/service.test.ts`, stockage en mémoire) : téléchargement validé et progression ; audio altéré
(empreinte) ; fichier tronqué ; annulation sans trace ; espace insuffisant avant téléchargement et quota dépassé à
l'écriture ; flux éditeur exclu ; autre onglet non perturbé ; nouvelle publication remplacée seulement une fois
validée ; démarrage avec téléchargement interrompu et fichier évincé ; suppression et purge ; progression locale,
copie serveur sans écrasement, politique de synchronisation, file conservée tant que le réseau manque.

Recette navigateur effectuée (build de production servi en local, API relayée en lecture vers le Worker, puis
coupure simulée : chaque appel `/api` interrompu comme une perte de réseau) :
téléchargement réel d'une version YouTube (5 Mo, SHA-256 vérifié) → relance à froid sans réseau → ouverture directe
sur « Téléchargements » → contenu, transcription, lecture depuis le fichier local, saut à 1:02 avec passage surligné,
pause, changement d'écran, « Reprendre à 1:11 » au redémarrage → suppression : stockages vides, app toujours ouverte.

## 5. Limites connues

- Le navigateur intégré utilisé pour la recette refuse les Service Workers sur `http://localhost` : la relance
  **par le Service Worker en mode avion** n'a pas pu être rejouée ici ; elle repose sur le précache existant
  (inchangé) et doit être vérifiée sur le Fold7.
- `navigator.storage.estimate()` baisse avec retard après une suppression (Chrome compacte IndexedDB plus tard).
  L'app affiche son propre décompte, exact immédiatement.
- Horloges client / serveur : la règle « l'écoute la plus récente gagne » compare l'heure de l'appareil à celle du
  Worker ; un décalage de quelques secondes peut départager à tort deux écoutes quasi simultanées.
- Hors ligne sans aucun téléchargement, l'app affiche « Connexion impossible » (comportement inchangé).
- Révocation de session : découverte seulement au retour du réseau ; les téléchargements sont alors purgés.
- Les épisodes de podcast préparés s'ouvrent hors ligne via `/library/:id` (la liste Explorer demande le réseau).
- Pas de téléchargement des flux officiels des éditeurs ni des images de couverture.

## 6. Recette sur le Fold7 (mode avion)

1. En ligne, ouvrir un contenu préparé (vidéo YouTube ou note), choisir la version, « Télécharger pour l'écoute
   hors ligne » ; attendre « Disponible hors ligne · N Mo ».
2. Lancer la lecture quelques secondes, mettre en pause.
3. Fermer complètement la PWA, activer le mode avion, rouvrir la PWA depuis l'écran d'accueil.
4. Attendu : bandeau « Hors ligne », ouverture sur Bibliothèque › Téléchargements ; ouvrir la version ;
   « Reprendre à … » ; lecture, saut dans la transcription, écran verrouillé et contrôles média.
5. Plier / déplier pendant la lecture, changer d'onglet, revenir.
6. Supprimer le téléchargement depuis la liste ; vérifier qu'il disparaît et que la taille affichée tombe à zéro.
7. Désactiver le mode avion : la position d'écoute faite hors ligne doit apparaître sur un autre appareil.
