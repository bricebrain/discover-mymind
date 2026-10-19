# V9-5 — Résultats de calibration, 20 octobre 2026

## Conclusion et proposition soumise à accord

Les annotations montrent que les valeurs actuelles par défaut (`same = 0,72`, `cross = 0,64`) regroupent trop largement les contenus. Relever les seuils améliore la précision, mais les composantes transitives peuvent encore réunir des faits différents. **Aucun réglage ne réunit ici une précision élevée et une bonne couverture.**

Si l’objectif immédiat est de privilégier les regroupements fiables, la proposition provisoire est :

```json
{
  "relatedSameLanguageScore": 0.75,
  "relatedCrossLanguageScore": 0.79,
  "relatedDoubtScore": 0.60,
  "relatedLlm": false
}
```

Cette proposition obtient 15 rapprochements corrects et 1 faux parmi les paires annotées réunies dans un groupe : **93,8 % de précision, 18,1 % de rappel (15/83)**. Elle manque les **15 événements annotés entre langues différentes**. Ce coût est substantiel ; ce n’est pas une calibration satisfaisante du rapprochement multilingue.

Recommandation : présenter ce réglage comme une option restrictive, puis obtenir l’accord de l’utilisateur sur ce compromis avant de modifier la configuration. Pour conserver une bonne couverture multilingue, une amélioration du contrôle de cohérence des groupes est préférable à la seule hausse des seuils ; elle ferait l’objet d’un changement distinct, avec ses tests.

`relatedDoubtScore = 0,60` est conservé, **pas nouvellement calibré** : avec le juge désactivé, cette valeur ne change pas les groupes. Les annotations seules ne permettent pas d’évaluer les réponses du juge ni de choisir son budget. Aucun accord d’activation de `relatedLlm` n’est présumé.

## Contrôle du CSV reçu

Les 363 paires et les 13 en-têtes correspondent à l’original. Les références, types, dates, catégories de langue et l’ordre des paires sont préservés. Aucune annotation absente ou invalide :

| Catégorie | Oui | Non | Total |
| --- | ---: | ---: | ---: |
| Même langue | 68 | 140 | 208 |
| Entre langues | 15 | 140 | 155 |
| Total | 83 | 280 | 363 |

Le passage dans le tableur a modifié 876 champs hors annotation : 501 champs avec des caractères UTF-8 interprétés comme du Latin-1, 15 titres avec ce même problème et suppression d’une apostrophe initiale, 360 scores arrondis (écart absolu ≤ 5,1 × 10⁻¹¹).

La copie normalisée `V9-5-paires-annotees.csv` reprend **uniquement les réponses** du fichier reçu, en les associant à la clé `(type_a, id_a, type_b, id_b)` ; tous les autres champs viennent de l’original. Chaque altération a été expliquée et vérifiée. Les réponses sont conservées sans réinterprétation. Le fichier reçu n’a pas été modifié.

Empreintes SHA-256 :

- Reçu : `1a392e00e789f8a5d9f60463bab57393423ba31bb249860042b1a8887b487217`.
- Normalisé : `d6d6b87598cbdb22e00dd10670a6a1c134df78c4e1322cc66fef67aad4dfb83c`.

## Évaluation native des scores

Commande exécutée depuis le worktree Atelier :

```sh
python3 discover_related_calibrer.py evaluate /private/tmp/discover-mymind-codex-v9-5/docs/calibration/V9-5-paires-annotees.csv
```

L’évaluateur existant teste les paires séparément, sans tous les filtres de production, avec une grille au pas de 0,02 :

| Langue | Seuil proposé par le script | Précision | Rappel |
| --- | ---: | ---: | ---: |
| Même langue | 0,74 | 94,4 % | 100 % |
| Entre langues | 0,76 | 100 % | 66,7 % |

Ce résultat ne valide pas les groupes : un chemin A–B–C permet de réunir A et C même si leur propre score est faible. À 0,75, les 15 paires positives entre langues passent toutes le seuil et aucun négatif direct de cette catégorie ne passe ; la grille native saute cette valeur. Le contrôle transitif reste indispensable.

## Simulation de la logique réelle

L’analyse supplémentaire utilise les **658 éléments du même instantané** que l’export, avec leurs vecteurs `bge-m3`, y compris les éléments non présents dans les paires annotées. Aucun nouveau texte ou vecteur n’est demandé au réseau.

Les comparaisons respectent les exclusions de textes identiques et de même empreinte, les éditeurs distincts, la fenêtre de 72 heures et les indices communs. Les groupes sont produits par la fonction existante `discover_related_similarity.calculate`, avec un juge simulé qui renvoie toujours `False`, comme `relatedLlm = false`. Le cache de cosinus de l’instantané a aussi été contrôlé par un recalcul indépendant ; il donne la même matrice de résultats au réglage actuel (36 vrais, 79 faux, 47 manqués).

Pour chaque réglage, les membres des groupes sont ensuite comparés aux 363 annotations. Un positif signifie ici que les deux contenus annotés se retrouvent **dans le même groupe**, y compris par transitivité. Le nombre de groupes et leur taille maximale concernent tout l’instantané ; les autres colonnes concernent uniquement l’échantillon annoté.

| Seuil même langue / entre langues | Vrais | Faux | Manqués | Précision | Rappel | Groupes | Taille max. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0,72 / 0,64 — défauts actuels | 36 | 79 | 47 | 31,3 % | 43,4 % | 19 | 26 |
| 0,74 / 0,76 — sortie native | 27 | 12 | 56 | 69,2 % | 32,5 % | 13 | 10 |
| 0,75 / 0,75 | 33 | 23 | 50 | 58,9 % | 39,8 % | 11 | 13 |
| 0,75 / 0,76 | 27 | 10 | 56 | 73,0 % | 32,5 % | 11 | 10 |
| 0,76 / 0,76 | 25 | 7 | 58 | 78,1 % | 30,1 % | 8 | 9 |
| **0,75 / 0,79 — option restrictive** | **15** | **1** | **68** | **93,8 %** | **18,1 %** | **10** | **7** |
| 0,76 / 0,79 | 11 | 0 | 72 | 100 % | 13,3 % | 7 | 5 |
| 0,80 / 0,80 | 7 | 0 | 76 | 100 % | 8,4 % | 4 | 4 |

Une grille complémentaire de 100 combinaisons a testé les seuils mêmes langues `(0,72 ; 0,74 ; 0,75 ; 0,76 ; 0,77 ; 0,78 ; 0,79 ; 0,80 ; 0,82 ; 0,84)` et entre langues `(0,64 ; 0,74 ; 0,75 ; 0,76 ; 0,77 ; 0,78 ; 0,79 ; 0,80 ; 0,82 ; 0,84)`. Parmi ces réglages, 0,75 / 0,79 offre le rappel le plus élevé avec une précision d’au moins 90 %. Ce n’est pas une optimisation continue ni une validation sur des données indépendantes.

## Pourquoi autant de positifs manqués ?

Parmi les 68 annotations positives de même langue, seules **11** sont admissibles comme lien direct après exclusion des paires de même éditeur et des textes identiques. Les 57 autres ne peuvent pas être récupérées par une simple baisse des seuils sans changer ces règles ; elles peuvent parfois se retrouver dans un groupe via une autre source.

Les 15 positifs entre langues sont admissibles directement. Le réglage à 0,79 les perd tous sur ce corpus. Cette limitation doit être acceptée explicitement si l’option restrictive est retenue.

Le rappel de 18,1 % porte sur les 83 positifs annotés, y compris ceux exclus des liens directs par les règles actuelles. Il ne faut pas le comparer à un rappel calculé sur les seuls 26 positifs admissibles directement.

## Exemples d’erreurs

- À 0,75 / 0,76, « Why France protests are spreading across Europe » et le discours télévisé de Macron se retrouvent dans un même groupe malgré une annotation `non` et un score direct de 0,623 (ligne 95 du CSV, en-tête inclus). La chaîne de voisins contourne le seuil direct.
- Au même réglage, une critique de l’isolement de Macron et une vidéo d’affrontements avec la police sont regroupées malgré `non` (ligne 108, score 0,668).
- À 0,75 / 0,79, le faux rapprochement restant concerne « Saudi airport strike, Trump-Zelenskiy spat and 'cockroach' leader freed » et « Saudi Airport Carnage, Europe Assassin Plot Arrest, France Contagion Risk » (ligne 278, score direct 0,742). Le rapprochement vient encore d’une chaîne ; l’annotation `non` est conservée.

## Portée des chiffres et suite

Ces mesures proviennent d’un unique instantané et d’un échantillon stratifié par score. Les seuils ont été choisis sur les mêmes annotations qui servent à les mesurer : **aucune performance future n’est garantie**, aucun taux global sur tout le corpus n’est estimé. Seulement 16 paires annotées sont prédites positives au réglage proposé.

La zone de doute et le juge restent inchangés. Aucun code de regroupement, aucune configuration réelle et aucune donnée de production n’ont été modifiés. La section « option restrictive » constitue la proposition exacte à approuver ; une amélioration de l’algorithme de groupes serait un chantier distinct.

Les 1 160 tests obligatoires ont été relancés avec succès, ainsi que TypeScript, lint et builds requis. Il n’y a aucune modification de code applicatif dans cette phase.
