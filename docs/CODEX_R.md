# R — rapprochement local de sources

Livraison dans deux worktrees, branche `codex/r-related` dans chacun :

- Discover : `/private/tmp/discover-mymind-codex-r`, base `main` (`a276efd`).
- Atelier : `/private/tmp/convert-codex-r`, base `feat/lot1` (`85a17fa`).

Aucun fichier `pwa/`, fichier vocabulaire, `interface.html` ou `convertisseur_web.py` modifié.
Aucun déploiement, migration distante, appel Ollama réel ou appel IA payant exécuté.
Migration réservée : **0024_related.sql**, testée uniquement dans D1 simulé.

## Fonctionnement Atelier

Le consommateur appelle `discover_related.run` pendant son temps libre, après un échec de prise de bail et la récupération des articles.
Il vérifie aussi la file distante : un bail `leased` interdit le passage. Le mode import de source seul ne lance pas les rapprochements.
L’arrêt du consommateur interrompt les lots grâce à `verifier`. Le passage reste synchrone avec ce consommateur : aucune préparation
locale ne démarre simultanément. Un autre Atelier peut prendre un bail après le contrôle initial ; il n’y a pas de verrou distribué
réservant le calcul des rapprochements.

Au plus un essai toutes les 900 secondes (horodatage persistant, même après une panne), une page de 200 changements,
200 nouvelles empreintes et des lots Ollama de 16. L’application abaisse sa priorité via `os.nice` si possible ; sur macOS
cela peut aussi abaisser les préparations ultérieures du même processus. Ollama est joint exclusivement sur
`http://localhost:11434/api/embed`, `keep_alive: "2m"`, sans modèle génératif local.

Le texte est nettoyé du HTML et des espaces puis limité à 900 caractères, titre compris.
Empreinte : SHA-256 de `model + NUL + texte`. SQLite `related.sqlite`, dans le dossier de travail de la file, mode 0600 :
textes/métadonnées, vecteurs `array('f')` en BLOB float32 natif, cosinus, curseurs, décisions IA, accusés de publication.
Les vecteurs restent sur le Mac. Les empreintes anciennes restent réutilisables, même après un changement de modèle.
Le compteur « encodés » compte ces empreintes, pas seulement les éléments actifs.

Les cosinus sont calculés par tranches de **10 000 paires** avec reprise persistante ; une première indexation peut donc nécessiter
plusieurs passages. Aucune publication du nouveau graphe avant la fin de ces tranches. Une modification du corpus réinitialise
le parcours, en réutilisant les cosinus dont les empreintes n’ont pas changé. La sélection finale des cinq voisins et la construction
des composantes parcourent les scores locaux ; le stockage des paires reste quadratique dans la taille du corpus.

Voisins : cinq scores >= `relatedMinScore`, tous types, sans soi-même ni texte identique après nettoyage/casse.
Événements : paires dans la fenêtre temporelle, seuil selon les langues et indice commun (nombre ou nom à majuscule hors début de phrase).
Sans indice ou dans la zone douteuse, vérification Gemini facultative. Une date absente/invalide interdit une paire événementielle,
mais pas un voisin. Une composante peut s’étendre sur plus de 72 heures par transitivité : la fenêtre porte sur chaque paire validée.
Le titre central est celui du membre de plus grand degré pondéré dans le graphe des paires validées ; égalités déterministes.
Le groupe est candidat dossier avec au moins deux membres et deux éditeurs/émissions distincts.

Publication : remplacement atomique des voisins de chaque source, lots de 40 sources maximum ; groupes envoyés individuellement.
Accusé local uniquement après réponse du Worker, reprise idempotente après coupure. Un ancien groupe disparu est envoyé avec `members: []`.
L’identité d’un groupe est SHA-256 des références triées, tronquée à 32 hexadécimaux : stable à composition constante,
nouvelle identité quand la composition change. Les changements distants invalident les accusés concernés, y compris une
corbeille/restauration entièrement survenue entre deux passages.

## Réglages (`config_discover.example.json`)

| Clé | Défaut | Sens |
| --- | --- | --- |
| relatedModel | bge-m3 | modèle Ollama |
| relatedThreads | 4 | threads Ollama, bornés de 1 à 4 |
| relatedIncludeNotes | true | inclure les notes ; false retire aussi leurs anciens voisins/groupes au prochain passage complet |
| relatedMinScore | 0.55 | voisinage |
| relatedWindowHours | 72 | écart maximal de publication d’une paire événementielle |
| relatedSameLanguageScore | 0.72 | validation directe même langue |
| relatedCrossLanguageScore | 0.64 | validation directe langues différentes ou inconnues |
| relatedDoubtScore | 0.60 | début de la vérification facultative |
| relatedLlm | false | activation volontaire de Gemini |
| relatedLlmDailyCap | 20 | réservations d’appels par jour UTC |

Les notes ont `language: "und"`, date de publication = création de la note : pas de langue ni date d’article inventées.
Les seuils restent les valeurs prudentes du brief, **pas des résultats d’une calibration utilisateur déjà réalisée**.

La vérification utilise `discover_ai.Client` via un sous-client limitant chaque demande à un seul appel physique,
Gemini Flash-Lite uniquement, sans OpenAI ni retry automatique. Cache SQLite par paire d’empreintes + dates,
réservation du plafond avant le réseau ; erreur/arrêt laisse une décision indéterminée conservatrice (pas de groupe).
Le compteur comprend les réservations échouées. Les consommations disponibles sont enregistrées avec `discover_costs.enregistrer`,
une clé distincte par paire ; les reprises en cache ne recompteront pas le coût. Un arrêt brutal après facturation mais avant
l’enregistrement des jetons ne permet pas de reconstituer le coût exact.

Panneau « Rapprochements · Ollama local » dans Contrôles, rafraîchi toutes les 30 secondes : dernier état observé d’Ollama
(ou cache local), empreintes encodées, dernier passage publié, groupes, réservations IA du jour et coût estimé du jour UTC.
Route locale `GET /api/discover/related`, sans jeton exposé au navigateur. Le passage tourne quand le préparateur est démarré.

## Contrat Worker pour Opus

Authentification inchangée : Bearer Atelier pour `/atelier/*`, session pour `/api/*`. Dates UTC ISO 8601.
Types de références : `article`, `episode`, `reflection`. Une vidéo suivie est une référence `episode`, avec `sourceKind: "youtube"`.
`sourceKind` vaut sinon `article`, `podcast` ou `note`.

### GET /atelier/related/items?after=0&limit=200

`after` entier >= 0 ; `limit` entier 1–200. Défauts 0 et 200. Valeur invalide : 400.

```json
{
  "items": [{"seq": 123, "type": "article", "id": "…", "sourceKind": "article", "title": "…", "excerpt": "…",
    "language": "en", "publishedAt": "2026-10-19T10:00:00Z", "updatedAt": "2026-10-19T10:01:00.000Z",
    "publisher": "The Guardian", "deleted": 0}],
  "nextCursor": 123,
  "hasMore": false
}
```

Curseur **numérique opaque de changement**, pas une date : évite les pertes quand plusieurs mises à jour ont la même date.
`updatedAt` est la date du journal de modification. Migration : inscription initiale du corpus existant ; triggers INSERT/UPDATE/DELETE,
plus propagation des changements d’émission/éditeur. Une ligne par référence conserve sa dernière séquence.
Ordre croissant de `seq`, page suivante strictement après `nextCursor`. `hasMore` signifie « page pleine » : la suivante peut être vide.
Corbeille/suppression : `{seq,type,id,deleted:1}` avec métadonnées nulles ; aucun texte de note en corbeille n’est renvoyé.
Le consommateur persiste ces suppressions avant d’avancer le curseur. Les podcasts et vidéos viennent des épisodes collectés des émissions,
les articles des flux Explorer ; pas de contenus préparés supplémentaires en doublon.

### POST /atelier/related

```json
{
  "sources": [{"type": "article", "id": "…", "neighbors": [
    {"targetType": "episode", "targetId": "…", "score": 0.78}
  ]}],
  "groups": [{"groupId": "b42f…", "title": "Titre suggéré", "dossierCandidate": true,
    "members": [{"type": "article", "id": "…"}, {"type": "episode", "id": "…"}]}]
}
```

200 `{ok:true}`. Corps <= 100 000 octets ; <= 40 sources distinctes, <= 5 voisins distincts/source, **<= 200 liens**,
<= 20 groupes distincts, <= 100 membres distincts/groupe et <= 200 membres cumulés. Scores finis dans [-1,1].
Références : identifiants alphanumériques/tirets de 1–96 caractères ; groupId minuscules/chiffres/tirets, 1–96 ; titre <= 300 caractères.
Tableaux `sources` et `groups` obligatoires, éventuellement vides. Entrée invalide : 400 ; corps trop grand : 413.
Les champs supplémentaires sont éliminés avant stockage : pas de vecteur ni de texte libre caché dans les métadonnées du groupe.

Remplace intégralement les voisins des sources listées ; `neighbors: []` les efface. Sources et cibles absentes ou en corbeille ignorées.
Un groupe remplace ses membres ; `members: []` supprime le groupe. Membres absents ignorés.
Six statements SQL, un `DB.batch` transactionnel (voir [contrat D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)).
Même contenu de groupe normalisé : `updatedAt` inchangé. Les triggers suppriment les liens entrants/sortants et les appartenances
lors des suppressions, et immédiatement lors de la mise en corbeille d’une note.

### GET /api/related?type=article&id=…

```json
{
  "neighbors": [{"type": "episode", "id": "…", "sourceKind": "podcast", "title": "…", "publisher": "…", "href": "/?e=…", "score": 0.78}],
  "groups": [{"groupId": "b42f…", "title": "Titre suggéré", "dossierCandidate": true,
    "updatedAt": "2026-10-19T10:02:00.000Z",
    "members": [{"type": "article", "id": "…", "sourceKind": "article", "title": "…", "publisher": "…", "href": "/?a=…"}]}]
}
```

Voisins triés par score décroissant puis référence, cinq maximum. `groups` est un tableau pour tolérer une publication interrompue
entre ajout du nouveau groupe et retrait de l’ancien. Groupes de moins de deux membres visibles masqués.
Le drapeau candidat est aussi vérifié contre les éditeurs des membres encore visibles. Une source absente/en corbeille retourne
200 `{neighbors:[],groups:[]}`. Les cibles et membres sont joints aux données vivantes : aucune note en corbeille ne fuite.
Liens internes actuels : article `/?a=<id>`, épisode/vidéo `/?e=<id>`, note `/mind?n=<id>`.

### GET /api/related/groups?since=2026-10-01T00:00:00Z

200 `{groups:[…]}`, mêmes objets que ci-dessus, date inclusive, plus récents d’abord, maximum 50 groupes.
Sans `since` : depuis 1970. Date invalide : 400. Il s’agit d’un aperçu récent, pas d’une API de réplication exhaustive paginée.
Aucun dossier créé automatiquement. Pour préparer un dossier, sélectionner les sources via le flux existant ; un `article` Explorer
doit d’abord être transformé en note Article (`POST /api/articles/:id/note`) puis référencé comme `reflection` dans le dossier existant.

## Calibration et validation

Depuis le worktree Atelier :

```sh
python3 discover_related_calibrer.py export /tmp/paires-r.csv --root /chemin/vers/.discover-queue
# Remplir meme_evenement avec oui/non ou 1/0.
python3 discover_related_calibrer.py evaluate /tmp/paires-r.csv
```

Échantillon déterministe réparti par tranches de score de 0,05 et par mêmes/différentes langues, 20 paires par strate,
fenêtre de 72 h, scores >= 0,40. Export sans réseau. Évaluation : précision/rappel des paires pour chaque seuil 0,50–0,84,
proposition visant 90 % de précision, puis précision/rappel des relations transitives des composantes sur les paires annotées.
Les résultats sur cet échantillon stratifié ne sont pas une estimation non biaisée de tout le corpus ; un échantillon plus grand
et des exemples négatifs sont nécessaires avant de modifier les seuils dans l’exemple de configuration.

Validation :

- `worker/` : `npx tsc --noEmit -p .` vert ; `npm test` : **328 tests, 29 fichiers verts**.
- Atelier : `DISCOVER_CONTRACTS_DIR=/private/tmp/discover-mymind-codex-r/contracts python3 -m unittest discover -s tests -q` :
  **264 tests verts**, dont 12 tests R. Variable indispensable dans ce worktree séparé pour retrouver les contrats.
- Doubles de transports Ollama/Worker/IA : empreinte unique, changement de modèle/texte, doublons, panne Ollama,
  bail/préparation en cours, intervalle, limite de lots, fenêtre d’archive, seuils multilingues, indices, plafond/cache/coût IA,
  coupure de publication, suppression/restauration, reprise des cosinus, export/lecture CSV.
- Worker : authentification, curseurs, corbeille, cascades article/épisode/note, lot maximal de 200 liens, lots invalides,
  cibles absentes, idempotence des groupes, consultation des voisins et des groupes récents.

Limites : aucune mesure de performance sur Ollama réel ni de CPU Worker en production ; le budget de 10 ms n’est donc pas certifié.
Les six requêtes SQL et la taille des lots bornent le traitement Worker, mais la volumétrie réelle reste à mesurer.
Les groupes de plus de 100 membres sont conservés localement et bloquent leur publication avec une erreur explicite (pas de troncature silencieuse).
Les notes n’ont pas de langue explicite ; extraction d’indices simple, sans reconnaissance d’entités.
Le calcul reste quadratique en stockage, même si les cosinus coûteux sont bornés et reprenables.
Les données SQLite locales ne sont pas chiffrées ; elles restent dans le dossier de travail du Mac.

Fichiers d’intégration partagés : `worker/src/index.ts` (+3 lignes), `worker/src/routes/atelier.ts` (+4 lignes),
`worker/test/security.test.ts` (liste des quatre nouvelles tables), `discover_queue.py`, `discover_http.py`,
`discover_queue.html`, `discover_queue.js`, `config_discover.example.json`. Logique séparée dans les modules `related/` et `discover_related*`.
