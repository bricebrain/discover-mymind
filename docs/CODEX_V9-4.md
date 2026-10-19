# V9-4 — I4 : écoute active

19 octobre 2026. Branche `codex/v9-4`, base `d13e9b0`, worktree `/private/tmp/discover-mymind-codex-v9-4`.
Les lots V9-1 à V9-3 restent inclus par filiation. Aucun changement du checkout principal ni de l'Atelier actif.

## Comportements livrés

- **Répéter le passage** : revient au début du segment courant et reprend la lecture. Après une pause automatique, répète
  le passage qui vient de finir, même si le suivant commence exactement à la même borne.
- **Ce passage à 0,75×** : recommence le segment à 0,75, puis restaure la vitesse choisie à sa fin. La vitesse temporaire
  ne change ni la préférence en mémoire du lecteur ni `discover.playbackRate`. Un second clic recommence le passage lent.
- **Pause après chaque passage** : option de session du lecteur, désactivée au départ. Pause à la fin du segment, position
  ramenée à sa borne exacte ; « Lecture » poursuit le suivant, y compris après un silence entre deux passages. Le surlignage
  reste sur le passage terminé pendant la pause, sans modifier l'instant audio ou la progression enregistrée.
- Commandes partagées dans le détail d'une version (`PlaybackControls`) et dans le volet du lecteur complet. Une version
  doit être la piste courante, avoir des métadonnées audio chargées et une synchronisation vérifiée. Dans un silence sans
  segment courant, répéter/ralentir sont désactivés ; l'option de pause peut rester active.
- Saut manuel, changement de vitesse choisie, changement de piste/publication, arrêt, erreur ou démontage restaurent la
  vitesse normale lorsque nécessaire. Une pause manuelle au milieu d'un passage lent conserve ce ralentissement pour la
  reprise de ce passage.
- La minuterie de sommeil reste prioritaire. La pause de passage empêche l'enchaînement des téléchargements à la fin de la
  dernière phrase ; désactivée, elle ne change pas l'enchaînement existant.

L'option reste celle du lecteur pour la session ; elle ne s'applique qu'aux variantes admissibles. Les flux officiels sans
référence de version préparée, les textes seuls, les transcriptions non vérifiées, les bornes absentes/non finies/inversées,
les chevauchements ou les passages dépassant la durée audio chargée ne déclenchent pas d'écoute active.

## Découpage et fichiers

| Fichier PWA | Responsabilité |
| --- | --- |
| `player/segmentBounds.ts` | Validation des bornes, passage courant et prochain passage, intervalles semi-ouverts |
| `player/ActiveListening.ts` | Contrôleur sur le même `HTMLAudioElement`, pauses, ralentissement temporaire et timers |
| `player/useActiveListening.ts` | Raccordement React, état et commandes du contrôleur |
| `player/ActiveListeningBridge.tsx` | Chargement de la transcription de la publication réellement lue via le hook/cache existant |
| `listening/ActiveListeningControls.tsx` | UI commune présentative, kit existant et cibles de 44 px |
| `player/PlayerProvider.tsx` | Branchement au lecteur, restauration lors des commandes existantes, montage du bridge |
| `player/types.ts`, `content/variants.ts` | Référence optionnelle de publication/variante sur une piste préparée |
| `content/useContentReader.ts`, `content/VariantControls.tsx` | Actions du détail et maintien du surlignage à la pause de fin |
| `player/FullPlayerSheet.tsx` | Commandes dans le lecteur complet |
| `listening/useListeningAutomation.ts` | Respect de la pause de passage avant l'enchaînement I5 |

`PlayerProvider.tsx` reste sous 300 lignes. Les nouveaux modules sont courts, sans nouvelle bibliothèque ni API backend.
La transcription est chargée avec la clé React Query existante `content-segments/publication/variante` et le cache hors ligne
existant. Un téléchargement devenu piste via `trackFromDownload` conserve automatiquement cette référence.

La vérification de synchronisation utilise le même `timingVerified` que le lecteur de contenu. Le contrôleur vérifie aussi
la cohérence des bornes et de la durée réellement chargée avant d'exposer les commandes.

Le contrôleur suit les événements natifs et complète `timeupdate` avec un timer calculé à la vitesse réelle. Au réveil,
il relit l'horloge média : une attente réseau ne devient pas une progression fictive. Les timers sont effacés à la pause,
au saut et au démontage. Les passages en cours de publication ne sont pas devinés depuis le contenu courant : l'identité
inclut le contenu, l'audio, la publication et la variante. Les réponses de transcription périmées sont ignorées.
Une nouvelle publication est réassociée même si l'URL et l'empreinte audio sont inchangées ; une URL locale remplaçant l'URL
réseau d'un même audio est également prise en compte.

## Vérifications

| Projet | Commandes et résultat |
| --- | --- |
| Discover PWA | `npm test` : **218 tests / 39 fichiers** ; `npx tsc --noEmit -p .`, `npm run build` verts |
| Discover Worker | `npm test` : **345 tests / 31 fichiers** ; `npx tsc --noEmit -p .` vert |
| Atelier V9-3 isolé | `DISCOVER_CONTRACTS_DIR=/private/tmp/discover-mymind-codex-v9-4/contracts python3 -m unittest discover -s tests -q` : **284 tests verts** |
| EnglishFluency Worker | `npm test` : **223 tests / 17 fichiers**, verts |
| EnglishPWA | `npx tsc -b && npm test -- --run && npm run lint && npm run build` : **90 tests / 15 fichiers**, tout vert |

**28 nouveaux tests**, sans accès payant, dans :

- `player/ActiveListening.test.ts` : bornes, erreurs de timing, répétition, ralentissement, pauses successives, silences,
  segments contigus, saut manuel, fin native, arrêt et timers, métadonnées absentes, nouvelle publication, erreur audio ;
- `player/PlayerActiveListening.test.tsx` : vrai fournisseur React avec élément audio simulé, choix de vitesse conservé,
  annulation du ralentissement, arrêt, URL locale et nouvelle publication sur le même audio ;
- `listening/activeAutomation.test.tsx` : blocage de l'enchaînement en pause active, enchaînement normal conservé,
  minuterie de fin toujours prioritaire.

Recette navigateur avec les **composants et le lecteur réels**, un **WAV silencieux local de 16 secondes**, quatre passages
horodatés et des réponses API entièrement fictives. À **375 px** : démarrage, pause réelle à 8 secondes, réécoute du passage
précédent à 0,75 et sortie du ralentissement à sa fin ; commandes également visibles dans le lecteur complet. À **720 px** :
pause à 4 secondes, commandes alignées et surlignage conservé sur le premier passage après l'arrêt automatique.

Captures : `/private/tmp/discover-v9-4-player-375.png`, `/private/tmp/discover-v9-4-detail-720.png`.
Les pages de recette, le WAV et le serveur local sur 4176 sont retirés. Un build final après leur retrait vérifie qu'aucun
asset de recette n'est livré. `git diff --check` est vert. Les avertissements existants de bundle, d'audio dans un test Worker,
de faux HTTPError Python et de SQLite expérimental restent non bloquants.

La précision en arrière-plan/écran verrouillé dépend des événements et timers du navigateur ; la recette Fold7 physique
reste à faire. Le hors ligne réutilise le cache existant, sans nouvelle promesse de validation du mode avion sur téléphone.
Aucune requête de production, génération IA/TTS, migration ou mise en ligne dans ce chantier.

## Livraison et suite

Lot prêt pour revue sur sa branche, sans fusion ni push. Aucun déploiement autorisé ou effectué.
Prochain chantier : **V9-5**, export des paires de rapprochement à annoter par l'utilisateur, puis calibration des seuils
avec son accord après lecture du CSV rempli.
