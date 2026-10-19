# V9-5 — Calibration du rapprochement

## État du chantier

Première phase livrée : export à annoter. **Calibration non terminée : les annotations de l’utilisateur sont attendues.** Aucun seuil proposé ni appliqué à ce stade. Le chantier suivant n’est pas commencé.

Worktrees :

- Discover : `/private/tmp/discover-mymind-codex-v9-5`, branche `codex/v9-5`, basée sur V9-4 (`8388f17`).
- Atelier : `/private/tmp/convert-codex-v9-5`, branche `codex/v9-5`, basée sur V9-3 (`30fee99`). Aucun changement de code Atelier.

## Livrables

- `docs/calibration/V9-5-paires-a-annoter.csv` : format natif du script existant, UTF-8 avec BOM, séparateur virgule, 13 colonnes ; dernière colonne vide.
- `docs/calibration/V9-5-NOTICE.md` : règles d’annotation et de restitution.
- Le présent compte rendu.

Le brief impose l’utilisation de `discover_related_calibrer.py` et son contrat CSV ; le fichier n’a pas été reconstruit dans un autre format de tableur.

## Source et méthode

Instantané SQLite cohérent par l’API `sqlite3.Connection.backup`, source ouverte en lecture seule :
`/Users/brice/mesProjects/myMobileProjects/convert/fileToImport/.discover-queue/related.sqlite`.
Copie de travail : `/private/tmp/discover-v9-5-cache/related.sqlite`. Le script ouvre uniquement cette copie. Le cache de l’Atelier, son processus et sa branche ne sont pas modifiés.

La copie contient 658 éléments et 659 vecteurs. Contrôle SQLite : `integrity_check = ok`.
Corpus : 426 éléments anglais, 230 français, 2 de langue indéterminée. Dates extrêmes : 20 décembre 2021 à 19 octobre 2026 ; le script ne retient que les paires distantes de 72 heures au plus.

Commande exécutée depuis le worktree Atelier :

```sh
python3 discover_related_calibrer.py export /private/tmp/discover-mymind-codex-v9-5/docs/calibration/V9-5-paires-a-annoter.csv --root /private/tmp/discover-v9-5-cache --model bge-m3
```

Export sans réseau, sans génération de vecteurs : cosinus sur les vecteurs locaux `bge-m3`, scores ≥ 0,40, au plus 20 paires par tranche de 0,05 et par catégorie de langue, tirage déterministe du script (graine 24).

Résultat : **363 paires**, dont **208 `same`** et **155 `cross`**. Aucune paire exportée ne contient de langue indéterminée. Aucun doublon de références de paire.
Toutes les annotations sont vides. Aucun champ ne commence par un caractère déclenchant couramment une formule de tableur (`=`, `+`, `-`, `@`).

SHA-256 de l’original :
`b5dc7d03c600cc069a7fd1957c2e1dcab71414fece71528719113fca1996b339`.

## Limites à prendre en compte après annotation

- Échantillonnage par tranches : les fréquences de l’export ne sont pas les fréquences de l’ensemble des paires candidates. Une précision mesurée ici doit être présentée comme une mesure de l’échantillon.
- L’export inclut 105 paires d’un même éditeur et 3 paires de textes identiques. Le regroupement réel exclut ces cas. Ils seront distingués lors de l’analyse.
- Le regroupement réel exige aussi un indice commun et applique une fenêtre temporelle. L’évaluateur existant teste des seuils de score puis des composantes transitives ; il ne reproduit pas tous ces filtres. Ses résultats seuls ne suffisent pas à valider le comportement final.
- `relatedDoubtScore` ouvre la zone de recours au juge, ce n’est pas un seuil automatique de regroupement. Son réglage dépend aussi de la couverture de cette zone et de la décision concernant le juge. **Ne pas activer `relatedLlm` sans accord.**
- Ni valeurs par défaut ni résultats synthétiques ne seront présentés comme une calibration utilisateur.

## Reprise après restitution

1. Conserver l’original ; comparer les en-têtes, références, scores et lignes du CSV rempli. Refuser les annotations invalides et signaler les lignes manquantes ou altérées avant évaluation.
2. Mesurer la couverture des annotations et les classes positives/négatives par langue et score. Les blancs restent des inconnues, jamais des négatifs.
3. Exécuter `discover_related_calibrer.py evaluate <csv-rempli>` puis examiner les erreurs, les filtres du regroupement réel et la transitivité. Demander des annotations complémentaires si nécessaire.
4. Proposer les trois paramètres avec métriques, exemples d’erreurs et limites. Attendre l’accord sur les valeurs avant toute modification de `config_discover.json`.

## Validation

Contrôles de l’export : 13 colonnes, 363 lignes, annotations vides, références de paires uniques, scores lisibles. L’évaluation du CSV vierge répond : « Aucune paire annotée : aucun seuil proposé. »

Suites obligatoires : **1 160 tests passent**, sans ajout ni modification de code applicatif :

- PWA Discover : 218 tests / 39 fichiers ; `npx tsc --noEmit -p .` et build réussis.
- Worker Discover : 345 tests / 31 fichiers ; `npx tsc --noEmit -p .` réussi.
- Atelier : 284 tests ; contrats de ce worktree fournis via `DISCOVER_CONTRACTS_DIR` et configuration factice locale issue de V9-3.
- Worker EnglishFluency : 223 tests / 17 fichiers.
- EnglishPWA : 90 tests / 15 fichiers ; TypeScript, lint et build réussis.

Les premiers lancements Worker/Atelier ont rencontré le refus sandbox d’ouvrir des ports loopback ; EnglishPWA ne pouvait pas écrire son cache TypeScript. Relances avec les permissions nécessaires réussies. Avertissements connus : taille du bundle PWA, lecture de corps audio dans un test Worker et nettoyage d’une fausse erreur HTTP Python.

## Production

Aucun changement de configuration réelle, aucun appel payant, aucune synchronisation ni publication. Aucun déploiement, aucune migration, aucun redémarrage de l’Atelier.
