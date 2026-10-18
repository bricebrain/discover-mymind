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
- Dix éléments récents conservés par source ; rétention existante de 30 jours hors histoires et humour. Les éléments sauvegardés, préparés ou en préparation sont protégés.
- Pas d’import de tout l’historique d’une chaîne. Le flux ne contient qu’une sélection récente, peut contenir des Shorts et ne donne pas la durée des vidéos.
- Pas de lecture directe du lien YouTube dans le lecteur audio : **Voir sur YouTube** ouvre l’original ; les versions préparées utilisent le lecteur existant.

## Intégration

Migration additive `0011_youtube_channels.sql` : `shows.source_type` (podcast par défaut), `shows.channel_id`, `episodes.video_id`. Les abonnements podcasts existants sont conservés.

Les routes `/api/shows/resolve`, `/api/shows`, `/api/shows/:id`, `/api/explorer` et `/api/episodes/:id` restent communes aux deux types. Le filtre Explorer `sourceType=podcast|youtube` est validé côté serveur. L’abonnement YouTube stocke l’URL canonique du flux correspondant à son identifiant.

Une vidéo suivie est envoyée avec `kind=youtube` et son identifiant de vidéo dans la file existante : même déduplication qu’un lien collé dans la PWA ou l’Atelier. Titre, langue et catégorie sont transmis au Mac. La publication rattache les vidéos suivies au contenu ; une vidéo déjà préparée avant la collecte est rattachée lors de son insertion.

Résolution des handles : lecture de la page de chaîne plafonnée à 2 Mo, extraction HTML du lien RSS/canonique. Pas d’extraction d’identifiants provenant des vidéos recommandées. Les erreurs YouTube sont affichées ; l’adresse `/channel/UC…` sert de solution de repli.

## Vérifications

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

Contrôle de production sans création : `@arte` et l’identifiant canonique de la chaîne renvoient un aperçu HTTP 200 avec les trois dernières vidéos ; l’Explorer podcasts reste accessible. Les 49 abonnements existants (38 actifs) sont conservés, aucune chaîne de test n’est enregistrée.
