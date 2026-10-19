# V9-5 — Correction de la cohérence des groupes

## Résultat, 20 octobre 2026

L’utilisateur a autorisé la correction après le bilan de `V9-5-ANALYSE.md`. Le code Atelier est prêt dans `/private/tmp/convert-codex-v9-5`, branche `codex/v9-5`, commit **`2fbd089`**. Le checkout actif `convert/`, sa branche `feat/lot1` et son processus n’ont pas été modifiés.

La fusion transitive est remplacée par des groupes dont **chaque paire de membres possède un lien événementiel validé**. A–B et B–C restent deux groupes si A–C n’est pas validé. Une source peut appartenir à plusieurs groupes ; ce cas est déjà pris en charge par le contrat Worker et par la liste PWA, qui affiche tous les groupes retournés.

La nouvelle proposition de seuils est :

```json
{
  "relatedSameLanguageScore": 0.75,
  "relatedCrossLanguageScore": 0.75,
  "relatedDoubtScore": 0.60,
  "relatedLlm": false
}
```

Elle remplace la proposition restrictive **0,75 / 0,79**, qui concernait l’ancien algorithme. **Ces nouvelles valeurs restent soumises à accord avant modification de la configuration réelle.** Le code conserve ses défauts existants ; ni fichier de configuration réel ni exemple de configuration n’a changé.

## Fichiers Atelier

- `discover_related_groups.py` : couverture déterministe des liens validés par des groupes cohérents.
- `discover_related_similarity.py` : intégration ; titre central calculé sur les liens internes au groupe, égalités départagées par référence.
- `discover_related_calibrer.py` : le diagnostic « groupes (scores seuls) » utilise le nouvel algorithme ; les tests de seuils par langue restent inchangés.
- `tests/test_discover_related_groups.py` : 19 tests ajoutés.

## Règle de construction

1. Conserver les règles de validation des liens : seuil par langue, indice commun, fenêtre temporelle, éditeurs distincts, juge facultatif selon la configuration existante. Aucun appel supplémentaire au juge n’est introduit.
2. Indexer ces liens, puis les parcourir par score décroissant et références triées en cas d’égalité.
3. Partir d’un lien encore non couvert. Ajouter ses voisins communs par affinité avec les deux sources initiales, uniquement si chacun est lié à **tous** les membres déjà retenus.
4. Marquer les liens internes au groupe comme couverts ; continuer jusqu’à couvrir tous les liens validés. Aucun lien indirect n’est inventé, aucun lien validé n’est perdu.

Cette couverture gloutonne évite l’énumération exhaustive des cliques maximales. Elle ne garantit pas le nombre minimal de groupes. Les groupes peuvent se chevaucher, sans fusion automatique de leurs appartenances. L’ordre, les membres, le titre et l’identité sont stables à entrées équivalentes ; l’identité reste le hash des références triées.

Les points de contrôle d’interruption sont conservés pendant l’indexation, la construction, la couverture et le calcul des titres. La préparation reste prioritaire selon la boucle existante. Les voisins « Voir aussi » sont inchangés ; les restrictions événementielles ne leur sont pas appliquées.

Lors d’une future publication autorisée, le mécanisme existant enverra les nouveaux groupes puis retirera les anciennes identités disparues. Sa reprise idempotente reste testée. La limite de 100 membres par groupe et son erreur explicite sont conservées. Aucun nettoyage du cache ni réencodage n’est nécessaire.

## Vérification sur le même instantané

Sources inchangées : 658 éléments, vecteurs locaux `bge-m3`, 363 paires annotées (83 positives, 280 négatives). Les textes et scores du CSV normalisé n’ont pas été modifiés. L’analyse complète inclut les éléments non annotés pour construire les groupes ; elle évalue ensuite les 363 paires. Pour deux sources présentes dans plusieurs groupes, une prédiction positive exige **au moins un groupe commun**, jamais un simple chemin entre groupes.

Comparaison avec le calcul de `convert` au commit `30fee99`, sur le même cache et sans juge :

| Algorithme et seuils même langue / entre langues | Vrais | Faux | Manqués | Précision | Rappel sur 83 positifs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ancien, 0,72 / 0,64 | 36 | 79 | 47 | 31,3 % | 43,4 % |
| Corrigé, 0,72 / 0,64 | 26 | 51 | 57 | 33,8 % | 31,3 % |
| Ancien, 0,75 / 0,75 | 33 | 23 | 50 | 58,9 % | 39,8 % |
| **Corrigé, 0,75 / 0,75** | **26** | **0** | **57** | **100 %** | **31,3 %** |
| Corrigé, 0,75 / 0,76 | 21 | 0 | 62 | 100 % | 25,3 % |
| Ancien, 0,75 / 0,79 | 15 | 1 | 68 | 93,8 % | 18,1 % |
| Corrigé, 0,75 / 0,79 | 11 | 0 | 72 | 100 % | 13,3 % |

À **0,75 / 0,75**, les 11 positifs admissibles de même langue et les **15 positifs sur 15 entre langues** sont retrouvés. Les 57 positifs restants concernent des paires exclues des liens directs par les règles existantes (même éditeur ou texte identique) ; le nouveau regroupement ne contourne plus ces exclusions. La couverture des positifs admissibles est donc 26/26, mais le rappel sur toutes les annotations reste 26/83.

Sur l’ensemble de l’instantané, ce réglage produit **27 groupes**, de **3 membres maximum**. Leurs relations internes correspondent exactement aux **39 liens validés** de cet instantané : contrôle indépendant de couverture, aucune paire non validée ajoutée. Les listes complètes de voisins avant/après sont identiques.

Une grille complémentaire a testé 70 combinaisons : mêmes langues `(0,72 ; 0,73 ; 0,74 ; 0,75 ; 0,76 ; 0,78 ; 0,80)`, entre langues `(0,64 ; 0,70 ; 0,72 ; 0,73 ; 0,74 ; 0,75 ; 0,76 ; 0,78 ; 0,79 ; 0,80)`. Parmi elles, 0,75 / 0,75 maximise le rappel avec au moins 90 % de précision.

Ces chiffres portent uniquement sur les annotations de ce même instantané, stratifiées par score et utilisées pour choisir les seuils. **Ils ne garantissent pas 100 % de précision sur de futures données.** Les 13 liens validés non annotés ne constituent pas des exemples validés par l’utilisateur.

## Validation et limites

- 19 nouveaux tests : chaîne, triangle, pont entre groupes, scores égaux, ordre et direction des liens, doublons, couverture des 64 graphes possibles à quatre sommets, interruption, vraies géométries vectorielles, éditeur identique, fenêtre de 72 heures, indices absents, seuil rejeté, langue inconnue, décision du juge, titres internes, identités stables, suppression de l’ancien groupe et reprise de publication, évaluateur CSV.
- Suites obligatoires réussies : 303 tests Atelier, 218 PWA Discover, 345 Worker Discover, 223 Worker EnglishFluency et 90 EnglishPWA : **1 179 tests**. TypeScript, lint et builds requis réussis avant commit.
- Le diagnostic CLI fondé sur le seul CSV ne connaît ni tous les liens du corpus ni les indices issus des extraits : il ne remplace pas la simulation complète.
- Les groupes peuvent être plus nombreux et partager une source. Les API conservent leurs plafonds existants, dont 50 groupes récents dans Explorer ; aucune promesse de liste exhaustive n’est ajoutée.
- Un lien direct erroné peut toujours produire un mauvais groupe. La correction supprime l’inférence transitive, elle ne remplace pas une annotation sémantique ni une validation sur de nouvelles données.

Aucun appel payant, aucune publication, aucune migration, aucun déploiement et aucun redémarrage de l’Atelier. `relatedDoubtScore` reste à 0,60 dans la proposition, sans prétention de calibration du juge ; `relatedLlm` reste désactivé.
