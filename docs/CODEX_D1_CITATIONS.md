# D1 — Aucun identifiant de passage dans la narration ou la voix

20 octobre 2026. Complément du lot Atelier cloud, branche `codex/atelier-cloud`, après `6f7fe3d`.

Signalement utilisateur : des listes telles que `(s0070, s0071, …, s0093)` apparaissaient dans les textes et étaient lues à voix haute sur le Mac. La correction Mac existante a été lue dans `discover_citations.py`, `adaptation.py`, `discover_speech.py` et ses tests ; **aucun fichier du Mac n'a été modifié**, sa branche reste `feat/lot1`.

## Correction cloud

- `worker/src/cloud/citations.ts` retire uniquement les groupes entre parenthèses/crochets qui contiennent exclusivement des identifiants source connus. Séparateurs virgule, point-virgule, espaces et retours à la ligne acceptés. Les formes avec zéros initiaux, comme `s0070` pour le passage cloud `s70`, sont reconnues.
- `editorial.ts` applique ce nettoyage aux champs `text` **et** `fr` avant le calcul de longueur, le contrôle éditorial et la voix. Le prompt impose désormais les références **uniquement dans `sourceSegments`**. Les métadonnées restent inchangées et la valeur reçue n'est pas mutée.
- Les parenthèses de faits, dates et pourcentages sont conservées. Un groupe ambigu, contenant une référence inconnue ou du texte mêlé à un identifiant, n'est pas supprimé arbitrairement : si un identifiant technique reste, la préparation est bloquée. Un passage devenu vide est refusé. Un texte discutant littéralement d'un code au format `s0070` peut donc être bloqué par prudence ; la source originale est conservée.
- `scripts.ts` et `workflow.ts` créent un checkpoint propre commun au juge, à Deepgram et à la publication. Cela couvre également un ancien checkpoint de script. L'original reste conservé ; aucun nouvel appel IA n'est nécessaire pour le nettoyer.
- Si un audio a **déjà été engagé** avec le texte contaminé, la reprise est bloquée : pas de réutilisation d'un son qui lirait encore les identifiants, ni de régénération payante automatique.
- `speech.ts` refuse tout identifiant technique restant **avant la requête Deepgram**, même en cas d'appel direct contournant le préparateur.
- `publish.ts` refuse un script contaminé. Aucun nettoyage après la voix : le texte affiché doit correspondre exactement au texte synthétisé.

Cette correction concerne les textes adaptés anglais/français. Elle ne réécrit pas les notes/transcriptions sources originales, ni des médias déjà publiés. Aucun changement de migration ou de contrat public.

## Validation

`worker/test/cloud-citations.test.ts` ajoute **13 tests**, dont la liste exacte du signalement (70 à 93, sans 85), les formes isolées/inline, les vrais faits entre parenthèses, les références inconnues, le paragraphe uniquement constitué de références, les anciens checkpoints, le refus avant HTTP et le refus de publication contaminée.

Le test du vrai Workflow reçoit maintenant volontairement du texte anglais et français contaminé par `(s0001)` / `[s0001]`. Il vérifie que les six requêtes TTS contiennent les textes propres, que les segments publiés ont **exactement les mêmes textes**, que les traductions sont propres et que les liens `sourceSegments` restent présents. Aucun fournisseur réel n'est appelé.

| Vérification finale | Résultat |
| --- | --- |
| Worker : TypeScript et `npm test` | 378 tests réussis |
| PWA : TypeScript, `npm test`, build | 224 tests réussis |
| Atelier, copie de test isolée V9-5 | 303 tests réussis ; cette copie n'inclut pas la récente correction personnelle du Mac |
| EnglishFluency Worker | 226 tests réussis |
| EnglishPWA : TypeScript, tests, lint, build | 90 tests réussis |

Total : **1 221 tests réussis**. Les avertissements existants de taille du bundle PWA et les traces attendues du test d'échec TTS subsistent.

Le lot cloud reste désactivé et non déployé. Aucun appel payant, aucune migration en production, aucune modification des contenus utilisateur ou de l'Atelier Mac.
