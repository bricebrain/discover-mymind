# Q — I6 : trois questions de compréhension

Livraison du brief Q uniquement, le 19 octobre 2026. Deux branches `codex/q-quiz`, une par dépôt.
Worktrees : `/private/tmp/discover-mymind-codex-q` et `/private/tmp/convert-codex-q`.
Aucune modification de `pwa/`, aucun déploiement, aucune migration en production et aucun appel payant.

## Découpage et fichiers

Atelier (`convert/`, base `feat/lot1`) :

- `discover_quiz.py` : génération facultative, cache via le client IA existant, validation métier.
- `discover_adaptation_schema.py` : schéma de réponse structurée `QUIZ`.
- `discover_preparation.py` : appel après le texte final, y compris corrections manuelles et seconde adaptation ; statistiques mises à jour ensuite.
- `discover_podcast_bundle.py` : attachement du quiz à la variante adaptée, conservation des quiz des autres variantes déjà publiées.
  C'est le constructeur utilisé par cette chaîne ; le mapper YouTube historique `discover_bundle.py` reste inchangé.
- `config_discover.example.json` : `comprehensionQuiz: true` ; mettre `false` dans la configuration locale pour désactiver sans appel IA.
- `discover_costs.py` : ventilation `quizUsd`, incluse dans les totaux IA existants, migration SQLite locale additive `quiz_micro`.
  Une reprise entièrement servie depuis le cache conserve le coût déjà enregistré de cette révision.
- `tests/test_discover_quiz.py` : cache par niveau/texte final, désactivation, erreurs, préparation simulée avec paquet réel,
  quiz invalide écarté, coût et migration du registre local.
- `tests/test_discover_costs.py` : ancien scénario centré sur les coûts isolé du quiz facultatif.

Discover :

- `contracts/manifest.schema.json`, `contracts/fixtures/quiz.json` : extension facultative et fixture commune TS/Python.
- `worker/src/quiz/validation.ts` : structure, bornes, trois choix distincts et trois questions distinctes.
- `worker/src/quiz/routes.ts` : lecture, correction, score et idempotence du premier choix.
- `worker/migrations/0020_quiz.sql` : colonne `variants.quiz_json`, table `quiz_answers`.
- `worker/src/publications/{types,validation,commit}.ts` et validateur de manifeste généré : réception et stockage atomique avec la publication.
- `worker/src/routes/contents.ts` : réutilisation de la visibilité des publications, retrait du quiz du détail public,
  effacement des réponses lors de la suppression d'un contenu.
- `worker/src/index.ts` : import et deux routes seulement (point d'intégration partagé).
- `worker/test/quiz.test.ts`, `worker/test/security.test.ts` : API, publication, confidentialité, concurrence et inventaire des tables.

## Contrat de publication (Atelier uniquement)

Extension rétrocompatible du manifeste `schemaVersion: 1` : `variants[].quiz` facultatif,
réservé aux adaptations en anglais. Les versions existantes sans quiz restent valides.

```json
{
  "quiz": [
    {
      "question": "What does the city plan to improve?",
      "choices": ["Public transport", "Private gardens", "Air travel"],
      "correctChoice": 0,
      "explanation": "The city plans to improve public transport.",
      "segmentIndex": 0
    }
  ]
}
```

L'extrait illustre une question ; un quiz valide contient **exactement trois** questions.
`correctChoice` et `segmentIndex` commencent à **zéro** ; `segmentIndex` désigne la position dans
les segments **de la variante adaptée**, pas un identifiant source ni un horodatage.
Limites : question 1–500 caractères, trois choix 1–300 caractères, explication 1–800 caractères.
Textes non blancs, choix et questions distincts après trim/minuscules ; aucune propriété supplémentaire.
Les explications et les questions sont demandées en anglais au niveau de la version ; la conformité linguistique
et la justesse sémantique reposent sur la génération, sans nouveau juge payant.

Le générateur utilise `Client.demander('quiz', ...)`, avec les fournisseurs/replis, retries et cache existants.
La clé dépend du modèle, du schéma, du niveau et du texte final. Erreur de format, références invalides ou fournisseur
indisponible : publication sans quiz. Les interruptions du bail et le budget maximal général continuent de s'appliquer.
Les appels réellement effectués, même invalides, restent comptabilisés dans `Client.appels`.

Le mapper Python écarte un quiz invalide. Le Worker écarte un quiz structurellement invalide avant validation du reste
du manifeste, sans modifier l'objet fourni. Au commit, il vérifie `segmentIndex < nombre de segments` : si cette
vérification échoue, la variante est publiée avec `quiz_json = NULL`. Le manifeste privé immuable peut encore contenir
ce quiz dont la référence était invalide ; seule la copie validée D1 sert l'API. Pas de nouvelle requête de génération côté cloud.
Le protocole existant de déclaration/upload/commit reste inchangé, fichiers audio/segments inchangés.

## API PWA pour Opus

Même authentification que les autres routes `/api` (selon `AUTH_DISABLED`), mêmes protections CSRF pour les écritures,
réponses `Cache-Control: no-store`. Application mono-utilisateur : score partagé entre ses appareils, pas par session.
Aucun quiz brut ni corrigé non répondu n'est exposé par le détail d'un contenu, ses segments ou l'export v2.
Le manifeste complet reste accessible uniquement par les routes Atelier déjà protégées par jeton.

### GET `/api/contents/:id/variants/:key/quiz?publication=<uuid>`

`publication` facultatif : publication courante par défaut. Une publication remplacée reste accessible durant la grâce
existante de sept jours, comme les médias. Publication d'un autre contenu, masquée, incomplète ou expirée : 404.

Réponse 200 avant toute réponse (une question abrégée ci-dessous, trois dans un quiz valide) :

```json
{
  "publicationId": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  "variantKey": "en-full-b1",
  "questions": [
    {
      "questionIndex": 0,
      "question": "What does the city plan to improve?",
      "choices": ["Public transport", "Private gardens", "Air travel"],
      "segmentIndex": 0,
      "answer": null
    }
  ],
  "score": {"correct": 0, "answered": 0, "total": 3}
}
```

`questionIndex` commence à zéro et reste stable pour cette publication.
Ni `correctChoice` ni `explanation` ne sont présents avant réponse à **cette question**.
Après réponse, `answer` contient le même objet de correction que le POST ci-dessous.
Sans quiz (ancienne version, option désactivée ou quiz rejeté) : `questions: []`, score `{correct:0, answered:0, total:0}`.
Variante absente : 404 `not_found`.

### POST `/api/contents/:id/variants/:key/quiz/answers`

Corps JSON obligatoire, limité à 1 024 octets :

```json
{"publicationId":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","questionIndex":0,"choice":0}
```

Publication explicite obligatoire pour qu'un changement de version entre lecture et réponse n'altère pas un autre quiz.
`questionIndex` et `choice` : entiers 0, 1 ou 2 (pas de chaînes ni de booléens).
Réponse 200 :

```json
{
  "publicationId": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  "variantKey": "en-full-b1",
  "answer": {
    "questionIndex": 0,
    "choice": 0,
    "correct": true,
    "correctChoice": 0,
    "explanation": "The city plans to improve public transport.",
    "answeredAt": "2026-10-19T10:00:00.000Z"
  },
  "score": {"correct": 1, "answered": 1, "total": 3}
}
```

**Première réponse conservée** : même choix renvoyé à nouveau → 200, date et score inchangés ;
un autre choix pour cette même question → 409 `already_answered`, aucun changement de score.
Concurrence : clé primaire `(publication_id, variant_key, question_index)` et `INSERT OR IGNORE`.
Les questions non répondues gardent leur correction masquée. Pas de remise à zéro ni de multi-tentatives dans ce brief.
Une nouvelle publication démarre un score distinct, même si elle conserve la même clé de variante.
Supprimer le contenu efface ses réponses ; les lectures suivantes répondent 404.

Erreurs JSON : `{"error":{"code":"…","message":"…"}}`.

| Statut | Code | Cas |
| --- | --- | --- |
| 400 | `invalid_answer` | Enveloppe, publication, question ou choix invalide/manquant |
| 400 | `invalid_json` | JSON illisible |
| 401 | `unauthenticated` | Session requise et absente |
| 403 | `csrf_origin` / `csrf_client` | Protections d'écriture existantes |
| 404 | `not_found` | Contenu, publication ou variante indisponible |
| 404 | `quiz_not_found` | Question absente / version sans quiz |
| 409 | `already_answered` | Premier choix différent déjà enregistré |
| 413 | `payload_too_large` | Corps trop volumineux |

### Coûts locaux

`GET /api/discover/costs` (Atelier) conserve son contrat, avec un champ supplémentaire
`preparations[].quizUsd` (USD, six décimales maximum). C'est une **part** de `geminiUsd`/`openaiUsd`,
déjà incluse dans `totalUsd`, pas une somme à ajouter. Les tarifs configurables existants s'appliquent.
Les appels servis par le cache ne sont pas facturés à nouveau ; désactivation → aucun nouvel appel quiz.

## Validation et intégration

Résultats finaux : **278 tests Worker (24 fichiers) et 205 tests Python réussis**, typecheck TypeScript réussi,
`git diff --check` propre dans les deux worktrees. Les avertissements non bloquants des suites existantes
(lecture d'un audio comme texte côté Worker, nettoyage d'une erreur HTTP côté Python) restent présents.
Commit Atelier : `e9b117f` sur `codex/q-quiz` (arbre propre).
Le commit Discover qui contient ce document est le sommet de `codex/q-quiz` dans ce dépôt.

- Python : `DISCOVER_CONTRACTS_DIR=/private/tmp/discover-mymind-codex-q/contracts python3 -m unittest discover -s tests -q`
  depuis le worktree Atelier. Une configuration locale factice issue de l'exemple suffit aux tests existants.
- Worker : `npm test` et `npx tsc --noEmit -p .` depuis `worker/`.
- Les validateurs partagés sont régénérés par `npm test` ; aucune dépendance ajoutée.
- Tests simulés : aucun accès payant Gemini/OpenAI/Deepgram, aucune publication distante ; D1/R2 et migration 0020 uniquement locaux.
- Pour l'intégration : reprendre les deux commits `codex/q-quiz`, intégrer le contrat partagé avant les tests Atelier,
  puis faire appliquer **0020** par le responsable du déploiement avant de servir ce Worker.
- Opus peut brancher la lecture des questions et le POST sur la variante affichée ; aucun composant PWA livré ici.
- Les réponses et scores restent hors de l'export v2 existant ; son extension éventuelle n'appartient pas à Q.
- Aucun chiffre de CPU en production revendiqué : lecture D1 par clé, trois questions/réponses au maximum, aucune génération dans les routes.
