# Brief Codex — vague 6 : rapprochement d'articles et d'épisodes (19 octobre 2026)

Rédigé par Claude Opus. Un seul chantier, **R**, côté Atelier + Worker. L'interface PWA (« Voir aussi », « Même événement »,
proposition de dossier) sera faite par Opus à partir du contrat que tu documenteras. **Ne rien modifier dans `discover-mymind/pwa/`.**

Lire d'abord : `docs/BRIEFS_CODEX_VAGUE2.md` (règles communes, toujours valables), `docs/PLAN_PARTAGE_CODEX_OPUS.md` (§§ 9–11),
`convert/discover_ai.py`, `convert/discover_queue.py`, `convert/discover_articles.py`, `worker/src/routes/atelier.ts`,
`worker/src/articles/`, `worker/src/dossiers/`.

## Décisions déjà prises (ne pas rediscuter)

- **Tout le calcul des vecteurs se fait dans l'Atelier, sur le Mac, avec Ollama et le modèle `bge-m3`** (déjà téléchargé).
  Aucun embedding sur Cloudflare (ni Workers AI, ni Vectorize). Le Worker ne stocke que des **liens et des groupes**, jamais de vecteurs.
- Mac de l'utilisateur : **Intel i7-9750H, 16 Go, processeur seul** (pas de puce Apple, pas d'accélération graphique).
  **Aucun modèle génératif local.** Pour les cas douteux, utiliser le client existant (`discover_ai.Client`, Gemini Flash-Lite),
  avec cache, coût enregistré dans `discover_costs.py`, plafond quotidien et option de désactivation.
- Mesure faite par Opus sur 210 vrais éléments (90 articles, 120 épisodes et vidéos), texte = titre + début du résumé (≤ 900 caractères) :

  | Modèle | Temps par texte (CPU) | Même événement EN↔FR | Médiane EN↔FR | Même langue, même événement |
  |---|---|---|---|---|
  | **bge-m3** (retenu) | ≈ 0,6 s | 0,68 – 0,74 | 0,33 | ≈ 0,77 – 0,79 |
  | qwen3-embedding:0.6b | ≈ 0,8 s | 0,60 – 0,68 | 0,19 | ≈ 0,75 – 0,86 |

  bge-m3 classe le mieux les paires de même événement entre langues (« Macron refuses minister's resignation » ↔ « Violences à
  Paris, démission refusée du ministre de l'Intérieur ») et c'est aussi le modèle de la recherche sémantique d'EnglishFluency.
- **Même sujet ≠ même événement.** Contre-exemple réel : un épisode d'archive « La manif des gilets jaunes » obtient 0,56 avec les
  articles sur les émeutes actuelles. D'où une fenêtre de temps et des indices complémentaires (ci-dessous).

## Ce qu'il faut livrer

### 1. Atelier : `convert/discover_related.py` (+ tests)

- **Éléments** : articles d'Explorer, épisodes de podcast, vidéos YouTube suivies, et notes My Mind (titre + début du texte ;
  option `relatedIncludeNotes`, activée par défaut, les notes restant dans le circuit habituel Atelier ↔ Worker).
  Récupération incrémentale via une route Atelier dédiée (voir § 2), par date de mise à jour.
- **Texte encodé** : titre + premiers paragraphes, ≤ 900 caractères, nettoyé (HTML, espaces). Empreinte = SHA-256(modèle + texte) :
  un élément n'est encodé **qu'une fois** ; un changement de modèle ou de texte provoque un nouvel encodage.
- **Stockage local** : SQLite dans le dossier de travail de l'Atelier (vecteurs `float32` en BLOB, ou `sqlite-vec` si disponible
  sans dépendance lourde ; numpy autorisé s'il est déjà installé, sinon Python pur). Rien n'est publié hors du Mac.
- **Ollama** : `POST http://localhost:11434/api/embed`, `model` configurable (`relatedModel`, défaut `bge-m3`), lots de 16,
  `keep_alive` court (2 min), `options.num_thread` limité (`relatedThreads`, défaut 4). Processus en **priorité basse**
  (`os.nice`). Si Ollama ne répond pas : passage sauté, message clair dans le journal, aucune erreur bloquante.
- **Ordonnancement** : uniquement quand **aucune préparation n'est en cours** (file vide ou sans bail actif), au plus un passage
  toutes les 15 minutes, borné (par exemple 200 éléments par passage), reprenable.
- **Voisins (« Voir aussi »)** : pour chaque élément, les 5 plus proches au-dessus d'un seuil (`relatedMinScore`, défaut 0,55),
  tous types confondus, en excluant l'élément lui-même et les doublons exacts.
- **Groupes « même événement »** (niveau 2), par composantes de paires validées :
  1. fenêtre de temps : publications à moins de **72 h** l'une de l'autre (configurable) ;
  2. similarité : départ prudent **≥ 0,72 même langue, ≥ 0,64 entre langues**, valeurs à calibrer (§ 3) ;
  3. indices : noms propres ou nombres en commun (extraction simple : mots à majuscule hors début de phrase, nombres) ; une paire
     sans aucun indice commun est rétrogradée en « douteuse » ;
  4. **zone douteuse** (par exemple 0,60–0,72 ou sans indice) : vérification « même événement : oui/non » par Gemini Flash-Lite,
     réponse JSON courte, mise en cache, au plus `relatedLlmDailyCap` appels par jour (défaut 20), désactivable (`relatedLlm: false`).
  Pas de niveau « thématique » : les catégories existent déjà.
- **Proposition de dossier** : un groupe d'au moins 2 sources venant d'au moins 2 éditeurs ou émissions différents est marqué
  `dossierCandidate` (titre suggéré = titre de l'élément le plus central). Rien n'est créé automatiquement.
- **Publication** vers le Worker (§ 2) : voisins et groupes modifiés depuis le dernier passage, en lots bornés, idempotents.
- Panneau minimal dans l'Atelier (dans le style de `discover_queue.html` / `discover_queue.js`, **sans toucher** à
  `interface.html` ni `convertisseur_web.py`, sauf une ligne de route si indispensable, à justifier) : état d'Ollama, nombre
  d'éléments encodés, dernier passage, groupes trouvés, appels LLM du jour et leur coût.

### 2. Worker Discover (migration **0024**)

- `GET /atelier/related/items?after=<curseur>&limit=` : éléments à encoder (type, id, titre, extrait borné, langue, date de
  publication, date de mise à jour, éditeur ou émission), pagination stable, notes en corbeille exclues.
- `POST /atelier/related` : remplace, pour une liste d'éléments sources, leurs voisins (`targetType`, `targetId`, `score`) et publie
  les groupes (`groupId` stable, membres, `dossierCandidate`, titre suggéré). Lots bornés (≤ 200 liens par requête) pour rester
  sous 10 ms de calcul ; idempotent ; cibles inexistantes ignorées.
- `GET /api/related?type=&id=` : voisins et groupe d'un élément, avec titre, type, éditeur et lien interne ; rien pour un
  élément supprimé ; notes en corbeille jamais renvoyées.
- `GET /api/related/groups?since=` : groupes récents, en particulier les candidats dossier (pour une future carte dans Explorer).
- Suppressions en cascade (article, épisode, note supprimés → leurs liens disparaissent).

### 3. Calibration

- Script `convert/discover_related_calibrer.py` : exporte un CSV de paires candidates (échantillon réparti sur les tranches de score,
  même langue et entre langues) avec titres, éditeurs, dates, score et une colonne `meme_evenement` vide, que l'utilisateur remplit.
- Le même script relit le CSV rempli et affiche, pour chaque seuil, précision et rappel des groupes, puis propose les seuils.
  Les seuils retenus vont dans `config_discover.example.json`.

## Acceptation

- Tests sans réseau ni Ollama réel (faux serveur Ollama, faux Worker, faux client IA) : encodage une seule fois par empreinte,
  changement de modèle → nouvel encodage, Ollama absent → passage sauté, préparation en cours → passage différé, fenêtre de
  72 h respectée (le cas « gilets jaunes » d'archive ne rejoint pas un groupe d'actualité), zone douteuse → appel LLM plafonné et
  mis en cache, publication idempotente.
- Worker : tests des trois routes, bornes de lot, cascades, notes en corbeille exclues ; `npm test` et typecheck verts.
- Atelier : `python3 -m unittest discover -s tests -q` vert.
- `docs/CODEX_R.md` : contrat exact des routes pour Opus, réglages, mesure réelle si tu peux la faire sans appel payant
  (Ollama local seulement), limites connues.
- Migration réservée : **0024** côté Discover. Aucun déploiement, aucune migration en production, aucun appel payant réel.
