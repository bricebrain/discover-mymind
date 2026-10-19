# I1 — Sélections Discover vers EnglishFluency

## Étude et circuit retenu (avant implémentation)

Étude : `englishfluency-worker/src/index.ts`, `vocabulary.ts`, schémas 0001/0002/0016,
`convert/discover_englishfluency.py`, `bundles.py`, `discover_cible.py`, `discover_http.py`.
`/words` lit/supprime mais ne crée pas de mot. Les routes `/articles/promote-words` et
`/podcasts/promote-words` ajoutent déjà du vocabulaire ; leur promotion modifie la prochaine révision
et ne fournit pas de reçu idempotent de sélection. I1 garde donc une route dédiée, sans réinitialisation. `words.examples` stocke les exemples bilingues ;
`word_progress` porte la progression par profil ; les enrichissements versionnés sont indépendants.
Le pont Atelier possède déjà le transport authentifié EF (`englishFluency` dans config Discover),
et bundles lit aussi `config_import.json`. Réutiliser ces accès, sans nouveau secret Worker à Worker.

Circuit : sélection → Worker Discover (instantané durable) → synchronisation explicite Atelier →
POST EF `/words/picks` → accusé Discover. Aucun appel IA, aucune UI PWA, aucun déploiement.
Les worktrees isolés sont `/private/tmp/{discover-mymind,convert,englishfluency-worker}-codex-i1`,
branche `codex/i1-vocabulary` dans chaque dépôt. Migrations réservées : Discover 0023, EF 0020.

## Contrat pour Opus

Session/CSRF Discover habituels :
- `POST /api/vocabulary/picks` : `{word,sentence,contentId,publicationId,variantKey,segmentIndex,language:"en"}`.
  Mot 1–120 caractères / 8 mots maximum ; phrase 1–4000 ; index entier à partir de 0.
  Publication visible, version anglaise et passage vérifiés ; la phrase doit être incluse dans
  le passage et contenir le mot (comparaison espaces/casse normalisés).
  Réponse `{pick}` ; une même sélection normalisée retourne le même identifiant (200, création 201).
- `GET /api/vocabulary/picks?after=0&limit=50&status=pending` : `{picks,nextAfter}`.
  Tri croissant par séquence, limite 1–100. Statuts : pending, sent, already_known, failed.
  Sans statut : tous. Instantané conservé même si la publication disparaît.
- `DELETE /api/vocabulary/picks/:id` : 204, supprime seulement la sélection Discover,
  sans retirer un mot/exemple déjà reçu par EF.

Atelier (Bearer existant) : `GET /atelier/vocabulary/picks` mêmes filtres ;
`POST /atelier/vocabulary/picks/:id/result` : `{status:"sent"|"already_known"|"failed",wordId?}`.
Un succès devient terminal ; une erreur tardive ne l'écrase pas. Erreur publique générique,
aucun corps d'erreur EF/secret conservé. Sélections supprimées : 404 à l'accusé.

EF (Bearer API_SECRET existant) : `POST /words/picks` :
`{sourceId,profileId,word,sentence,contentId,publicationId,variantKey,segmentIndex,language:"en"}`.
`sourceId` = `discover:<UUID sélection>`. Reçu unique par (profil, sourceId), empreinte du payload :
rejeu identique renvoie le résultat initial, payload différent = 409. Profil existant requis.
Recherche du mot par casse/espaces normalisés ; un mot connu reçoit un exemple `{en:sentence,fr:""}`
sans doublon. Sinon création déterministe d'un mot B1 de type « expression » ou « word »,
traduction vide (aucune traduction inventée). Progression SRS existante préservée intégralement ; si absente, initialisée à learning/due
immédiatement dans le même lot atomique (repetitions=1). Ni carte ni enrichissement réécrit.
Réponse `{ok:true,status:"sent"|"already_known",wordId}`. « already_known » signifie déjà dans
le référentiel, pas maîtrisé par l'utilisateur. Le nouveau mot devient disponible aux routes SRS existantes.

## Atelier et reprise

Module dédié et routes locales `GET /api/discover/vocabulary` et
`POST /api/discover/vocabulary/sync` (contrôles Host/Origin existants).
Une exécution parcourt pending et failed par pages ; accusé seulement après validation du résultat EF.
Une panne EF marque failed sans effacer la sélection ; une perte d'accusé rejoue le même sourceId.
Une deuxième exécution n'envoie plus les succès. Synchronisation explicite, aucun appel payant.
Configuration EF du pont si présente ; sinon lecture de config_import existante via bundles, sans modification.

## Découpage

Discover : migration 0023, `worker/src/vocabulary/{validation,routes}.ts`, branchements index/atelier,
`worker/test/vocabulary-picks.test.ts`. EF : migration 0020, `src/vocabularyPicks.ts`, branchement index,
`test/vocabularyPicks.test.ts`. Atelier : `discover_vocabulary_picks.py`, branchement `discover_http.py`,
`tests/test_discover_vocabulary.py`. Documentation et résultats complétés après vérification.

## Limites et suite

Mac nécessaire ; synchronisation explicite ; pas de retrait EF à la suppression Discover ; pas de
lemmatisation (pas d'assimilation automatique entre flexions). Traduction/enrichissement ultérieurs via
le circuit vocabulaire existant. La part de mots connus avant préparation sera un chantier distinct :
lecture du référentiel et de word_progress du profil, normalisation/lemmatisation à définir, résultat
indicatif, sans modifier les sélections ni lancer de génération.

## Vérifications finales

- Discover : `npm test` → **324 tests / 28 fichiers verts** ; `npx tsc --noEmit -p .` → OK.
- EnglishFluency : `npm test` → **216 tests / 17 fichiers verts** ; `npx tsc --noEmit -p .` → OK.
  Après ajout du test de rollback, `vitest run test/vocabularyPicks.test.ts` → **6 tests verts** :
  une erreur SQLite annule aussi le mot, le reçu et l'initialisation SRS.
- Atelier : `DISCOVER_CONTRACTS_DIR=/private/tmp/discover-mymind-codex-i1/contracts python3 -m unittest discover -s tests -q`
  → **246 tests verts**. Contrats explicitement pointés vers le worktree ; configuration Discover factice
  locale ignorée par Git (localhost:9, jeton de test), nécessaire à un ancien test qui passe `config={}`.
- Transport simulé : pagination, second passage sans appel supplémentaire, panne EF sans perte,
  perte d'accusé puis rejeu des mêmes sourceId, résultat EF invalide, mot déjà présent et SRS conservé.
- Fixture identique : `contracts/fixtures/vocabulary-pick.json` (Discover),
  `tests/fixtures/vocabulary-pick.json` (Atelier), `test/fixtures/vocabulary-pick.json` (EF), consommée par les tests TS/Python.
- Migrations exercées dans les bases de test uniquement. Ports loopback autorisés pour les suites
  Worker/Python ; aucun envoi réel, génération payante, migration distante ou déploiement.
- Aucun fichier PWA ni fichier vocabulaire personnel modifié. `discover_vocabulary.py` (cache existant)
  reste inchangé ; synchronisation isolée dans `discover_vocabulary_picks.py`. `bundles.py` est inchangé.

## Fichiers livrés et intégration manuelle

Discover : les deux modules vocabulary, migration 0023, tests vocabulary-picks et liste des tables du
`test/security.test.ts`, fixture et ce document. Fichiers partagés : **2 lignes ajoutées dans index.ts,
2 dans routes/atelier.ts**. EF : module vocabularyPicks, migration 0020, test et fixture ; **2 lignes
ajoutées dans index.ts**. Atelier : nouveau module et tests/fixture ; **5 lignes dans discover_http.py**.
Aucune dépendance ajoutée. Les dépendances des worktrees Node sont des liens locaux non commités.

Après relecture, intégrer les trois commits dans leurs dépôts respectifs. La migration EF **0020 est
prise par I1** : le contrôle final a constaté que V utilise déjà
`0019_lingvist_enrichment_version.sql` dans son worktree. L'état EF de base
inclut déjà le retrait SRT commité `ecd2c9c` et sa migration 0018 ; ne pas appliquer celle-ci implicitement
sans la relecture du responsable de ce chantier. Prévoir sauvegarde et application contrôlée de 0023
Discover et 0020 EF par le responsable de l'intégration ; ces opérations n'ont pas été exécutées ici.

Vérifier le profil EF existant et ses accès locaux (`englishFluency` dans config_discover, sinon
config_import), puis lancer **dans l'Atelier intégré** : `python3 discover_vocabulary_picks.py`.
Le CLI n'affiche que les compteurs sent/already_known/failed/unacknowledged ; toute erreur non accusée
reste reprenable. Ne pas changer de destination/profil entre un envoi et sa reprise.
L'Atelier expose aussi la commande via sa route POST locale existante, avec les en-têtes
`Origin: http://localhost:<port>` et `X-Discover-Atelier: 1` (ou l'origine 127.0.0.1 utilisée).
Aucun bouton Atelier ajouté : le CLI et les routes sont utilisables sans interface PWA.

Une sélection retournée contient ses champs de création ainsi que `id`, `seq`, `status`, `wordId`
(nullable), `error` (nullable), `createdAt`, `updatedAt`, et une empreinte technique `fingerprint`.
Le curseur `nextAfter` est null en dernière page. `GET /api/discover/vocabulary` expose la première
page de 50 sélections ; la synchronisation parcourt toutes les pages côté Python.

Référence vérifiée : les lots D1 sont transactionnels et annulés intégralement en cas d'échec,
[documentation Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

Commits des dépôts associés : Atelier `4421b81`, EnglishFluency `26961d0`, chacun sur
`codex/i1-vocabulary`. La migration EF a été retestée sous son nom définitif 0020
(les 6 tests I1 passent). Aucun changement requis dans le chantier V.
