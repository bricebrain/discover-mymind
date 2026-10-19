# Brief 2 — I3 + I5 : écoute, PWA uniquement

Livraison du 19 octobre 2026, terminée par Codex à partir du travail non commité de GLM.
Branche : `glm/i3-i5-ecoute` ; worktree : `/Users/brice/mesProjects/myMobileProjects/discover-mymind-glm-ecoute`.
Base conservée : `a0ec30b`. Commit fonctionnel : `bc63314`.

## Périmètre

Seul le Brief 2 est traité. Aucun changement au Worker, à ses migrations, à `convert/`, aux dépendances,
à `pwa/src/mind/*`, `pwa/vite.config.ts`, `pwa/src/sw.ts`, `pwa/src/app/App.tsx` ou `pwa/src/pages/MindPage.tsx`.
Aucun déploiement, aucune génération payante, aucune fusion dans `main`.
Le worktree dédié existant a été repris ; le checkout principal et les autres branches sont conservés.

## Comportements et choix

### I3 — Original du passage

- Le bouton « Original du passage » et le menu contextuel/appui long du paragraphe donnent les mêmes actions.
- La variante source est résolue depuis `derivedFrom`, puis depuis l’original publié si nécessaire.
- Les passages cités sont dédupliqués et ordonnés selon la transcription source.
- Le saut audio exige `timingVerified(source, 0)` et un début valide sur le **premier** passage cité.
  Sans durée mesurée de l’original, seuls les timings déclarés `exact` sont acceptés ; un flux éditeur
  non vérifié reste en texte. Aucun instant n’est calculé ou emprunté à un autre passage.
- Sans synchronisation, une fenêtre montre les textes source cités et leur français s’il existe.
  Les passages restent mémorisés quand le menu se ferme, pour éviter une fenêtre vide.
- Le point de retour conserve la piste, son `audioRef` et la position quittée dans la version adaptée.
  Un second saut ne dégrade pas ce point. Sans écoute courante de cette version, le lecteur utilise sa progression existante.
- Dans le lecteur complet, « Revenir à … B1 » reprend la piste adaptée et rouvre sa transcription.
  Le bouton est réservé à l’original rejoint avec la même référence audio. Une version texte seul rouvre sa page.
- Les dossiers utilisent directement `useDossierPassages`, `sourcesForSegment` et `sourceLink`
  de `SegmentSources.tsx` : leurs liens ouvrent les mêmes cibles que les pastilles existantes.
- Chargement, échec avec nouvelle tentative, et absence de passages sont explicites.

### I5 — Minuterie et enchaînement

- Dans le lecteur complet : 15, 30, 45 minutes, « Fin de l’épisode », et annulation.
- L’état de minuterie figure en premier dans le sous-titre du mini-lecteur, pour rester visible à largeur mobile.
  Le lecteur complet affiche le compte à rebours.
- Les minutes comptent depuis le choix, y compris pendant une pause. Vérification chaque seconde et au changement
  de visibilité ; une pause explicite permet aussi d’interrompre un audio en chargement.
- La minuterie « fin de l’épisode » ou une échéance déjà atteinte prime sur l’enchaînement.
- « Lire ensuite les téléchargements » est désactivé par défaut, désactivable à tout moment et conservé dans
  `localStorage` ; si ce stockage refuse les opérations, le choix reste valable dans la session.
- À la fin d’une version téléchargée, la prochaine version audio locale complète est choisie dans l’ordre exact
  fourni par `useOffline()` et affiché par `DownloadsList`. Textes seuls, états incomplets, fichiers locaux absents
  et empreintes incompatibles sont sautés. Pas de boucle et aucun repli réseau pour l’enchaînement.
- Une piste absente des téléchargements ou avec un `audioRef` différent ne déclenche pas cet enchaînement.
- Fermer le lecteur ou terminer sa session efface la minuterie et le point de retour.

## Fichiers créés

| Fichier dans `pwa/src/listening/` | Rôle |
| --- | --- |
| `sourceJump.ts` | Résolution de l’original, passages cités et début fiable |
| `useOriginal.ts` | Requête React Query existante et logique du saut/point de retour |
| `OriginalAccess.tsx` | Bouton accessible, menu, fenêtre de texte et liens de sources |
| `returnPoint.ts` | Point de retour en mémoire et reprise explicite |
| `sleep.ts` | Minuterie de session, échéances et priorité à la fin de piste |
| `nextUp.ts` | Ordre des téléchargements, piste locale et préférence d’enchaînement |
| `useListeningAutomation.ts` | Pause à échéance et traitement unique de la fin de piste |
| `ListeningControls.tsx` | Contrôles MUI, état visible et bouton de retour |
| `sourceJump.test.ts` | Choix et ordre du passage ; absence de synchronisation ou du premier instant |
| `returnPoint.test.ts` | Retour à la position, reprise existante, texte seul et notifications |
| `sleep.test.ts` | Échéance, annulation et priorité de la minuterie sur l’enchaînement |
| `nextUp.test.ts` | Ordre, fin de liste, fichiers absents, textes seuls, empreintes et préférence |

## Points d’intégration, un par un

1. `pwa/src/player/PlayerProvider.tsx` : ajout de `ended` à l’état initial ; activation sur l’événement audio `ended` ;
   remise à zéro au démarrage, changement de piste et arrêt.
2. `pwa/src/player/PlayerProvider.tsx` : ajout d’une méthode `pause()` à l’API du contexte pour la minuterie.
   Les handlers Media Session, l’enregistrement par `audioRef` et `AudioPosition` restent ceux du lecteur existant.
3. `pwa/src/player/types.ts` : déclaration du booléen `ended` et de la méthode `pause`.
4. `pwa/src/player/MiniPlayer.tsx` : montage permanent de `useListeningAutomation`, même avec le tiroir fermé.
5. `pwa/src/player/MiniPlayer.tsx` : état de minuterie dans le mini-lecteur ; bouton de retour et contrôles dans le tiroir.
6. `pwa/src/content/VariantTranscript.tsx` : branchement de `useOriginal`, du bouton, du menu et de l’appui long ;
   le clic suivant le menu contextuel est neutralisé pour éviter un saut audio involontaire.
7. `docs/GLM_I3_I5.md` : ce compte rendu et la recette téléphone.

Aucun changement requis dans les fichiers réservés à Opus ni dans le service hors ligne.
Les nouveaux modules restent sous 110 lignes par fichier.

## Validation automatisée

Dépendances du worktree déjà présentes à la reprise, vérifiées par
`npm install --prefix pwa --ignore-scripts --no-audit --no-fund` : à jour, aucune dépendance ajoutée.

Commandes exécutées dans le dossier `pwa/` du worktree :

| Commande | Résultat |
| --- | --- |
| `npx tsc --noEmit -p .` | Réussi |
| `npx vitest run` | **17 fichiers, 101 tests réussis** |
| `npm run build` | Réussi, bundle PWA et Service Worker générés |

`git diff --check` : réussi. Le build signale un chunk principal supérieur à 500 kB
(environ 800 kB avant gzip), avertissement non bloquant ; pas de refonte de bundle dans ce brief.
Tests Worker et Python non exécutés : aucun changement dans ces périmètres, conformément au brief PWA uniquement.

## Limites et recette restant à effectuer

- Tests de logique automatisés et compilation validés ; aucune recette navigateur interactive ou sur Fold7 physique
  effectuée pendant cette reprise. Les contrôles ci-dessous restent à faire après relecture/intégration par Opus.
- Le navigateur peut suspendre JavaScript en arrière-plan : une minuterie à durée ne garantit pas un arrêt à la seconde
  exacte si Android suspend la PWA. L’échéance absolue est revérifiée dès la reprise et bloque une piste suivante.
- Point de retour et minuterie sont limités à la session ; l’enchaînement, lui, garde son réglage.
- Le téléchargement actuel d’une adaptation n’inclut pas automatiquement l’original.
  Hors ligne, son texte ou son audio exigent une transcription en cache ou la version source téléchargée séparément.
  Sinon l’interface propose de réessayer ; aucun téléchargement implicite n’est ajouté.
- Aucun ajout aux actions Media Session ; leur fonctionnement physique reste à vérifier.

### Vérification manuelle sur le téléphone

Utiliser des contenus déjà préparés, sans nouvelle génération.

1. Ouvrir une version B1 avec original synchronisé. Écouter puis mettre en pause vers 1:23, ouvrir le menu d’un
   paragraphe et choisir « Écouter l’original ici ». Vérifier le départ au premier passage cité.
   Ouvrir le lecteur complet et « Revenir à … B1 » : retrouver environ 1:23, le bon audio et sa transcription.
   Refaire en lecture et après plusieurs sauts vers l’original ; naviguer entre les onglets pendant l’écoute.
2. Refaire depuis un original sans audio puis un flux non synchronisé : obtenir « Lire le passage original »,
   vérifier les textes affichés après fermeture du menu et l’absence de saut à un instant supposé.
   Tester aussi le bouton au clavier/lecteur d’écran et l’appui long sur Android.
3. Sur un dossier, vérifier que « Ouvrir la source » mène exactement à la même cible que sa pastille, pour
   un épisode, un contenu et une note ; aucune précision temporelle supplémentaire n’est inventée.
4. Télécharger plusieurs versions et relever leur ordre dans la liste, dont un texte seul si disponible.
   Activer « Lire ensuite », passer en mode avion, avancer à quelques secondes de la fin de la première.
   Vérifier le passage au prochain audio téléchargé, le saut du texte seul et l’arrêt en fin de liste.
   Désactiver l’option et vérifier qu’il n’y a plus d’enchaînement.
5. Activer simultanément l’enchaînement et « Fin de l’épisode ». Aller près de la fin : vérifier l’arrêt,
   l’effacement de la minuterie et l’absence de départ de la piste suivante.
6. Choisir 15 minutes : vérifier le compte à rebours et l’état du mini-lecteur une fois replié, puis annuler.
   Vérifier également les choix 30 et 45 minutes. Pour une vraie échéance, laisser 15 minutes en lecture,
   dont une partie écran verrouillé : constater la pause et noter un éventuel retard Android.
7. Écran verrouillé : lecture, pause, sauts et recherche de position ; déverrouiller, vérifier la progression,
   fermer/réouvrir la PWA et contrôler la reprise indépendante B1/original. Plier/déplier le Fold7 pendant l’écoute.
8. Fermer le lecteur avec une minuterie active, puis ouvrir une autre piste : vérifier que la minuterie et le
   bouton de retour précédent ont disparu. Vérifier aussi la lecture locale et la suppression d’un téléchargement.
