# Briefs Codex — vague 3 (19 octobre 2026)

Rédigés par Claude Opus. Claude Opus termine la refonte de l'interface (étape 7 : derniers écrans MUI, puis retrait de MUI).
**Codex ne modifie toujours rien dans `discover-mymind/pwa/`** : il livre le serveur, l'Atelier et une API documentée ;
Opus branchera l'interface ensuite. Les trois chantiers sont indépendants : un worktree chacun.

Lire d'abord : `docs/BRIEFS_CODEX_VAGUE2.md` (règles communes, **toutes toujours valables**), `docs/PLAN_PARTAGE_CODEX_OPUS.md`
(§§ 9 à 11), puis le code concerné.

## Rappels propres à cette vague

- Pas de préparation dans le cloud (§ 11) : tout ce qui génère du texte ou de l'audio se fait dans l'Atelier sur le Mac.
- Migrations réservées : **0020** pour Q (I6), **0021** pour N (I7), **0022** pour W (I8). Aucune autre sans demander.
- Aucun appel payant réel pendant les tests (Gemini, OpenAI, Deepgram simulés).
- Worker gratuit : 10 ms de calcul par requête ; pas de calcul lourd dans une route, agrégats SQL simples et bornés.
- Résumé final dans `docs/CODEX_<CHANTIER>.md` avec le contrat d'API exact (requêtes, réponses, erreurs) pour Opus.

---

## Brief Q — I6 : trois questions de compréhension par préparation

- **Atelier** : à la fin de l'adaptation, générer 3 questions de compréhension en anglais (QCM à 3 choix, une bonne réponse,
  courte explication, référence au passage `segmentIndex`), au niveau de la version. Dans le même appel que l'adaptation si le
  schéma le permet (`discover_adaptation_schema.py`), sinon un appel court mis en cache comme les autres (`discover_ai.py`).
  Coût ajouté visible dans `discover_costs.py`. Désactivable dans `config_discover.example.json`.
- **Publication** : les questions voyagent avec la version publiée (paquet existant, `discover_bundle.py` /
  `worker/src/publications/`). Une version sans questions reste valide (anciennes versions).
- **Worker** : stockage (migration 0020 si une colonne ou table est nécessaire), `GET` des questions d'une version, et
  `POST` d'une réponse (choix, juste/faux) pour garder le score ; aucune bonne réponse renvoyée avant la réponse de l'utilisateur.
- Fichiers : `convert/discover_preparation.py`, `convert/discover_adaptation_schema.py`, nouveau `convert/discover_quiz.py`,
  `worker/src/publications/…`, `worker/src/routes/contents.ts` (ou module `worker/src/quiz/`), tests des deux côtés.
- Acceptation : une préparation simulée publie 3 questions valides ; questions mal formées rejetées sans bloquer la publication ;
  l'API ne divulgue pas la réponse avant l'envoi ; tests verts.

## Brief N — I7 : niveau qui s'ajuste par émission

- **Worker** : après écoute d'une version, l'utilisateur peut dire « trop facile / juste / trop dur ». Enregistrer ce retour
  (migration 0021) avec la version, l'émission et le niveau. `POST /api/contents/:id/variants/:key/feedback`.
- Règle d'ajustement simple et explicable : par émission, deux « trop facile » de suite au même niveau → proposer le niveau
  au-dessus ; deux « trop dur » → en dessous ; jamais au-delà de A2 / C1 / original. **Proposer, pas imposer** :
  `GET /api/shows/:id/level-suggestion` renvoie le niveau suggéré et la raison ; l'application de la suggestion passe par le
  PATCH existant de l'émission (`autoLevel`).
- Les préparations manuelles (`PrepareDialog`) pourront préremplir le niveau suggéré : exposer aussi la suggestion dans la
  réponse de l'épisode ou de l'émission, au choix (le documenter).
- Fichiers : `worker/src/routes/shows.ts`, `worker/src/routes/contents.ts` (ou module `worker/src/levels/`), migration 0021, tests.
- Acceptation : règle testée (séquences, bornes, retour annulé ou modifié), aucune modification automatique d'un réglage.

## Brief W — I8 : bilan de la semaine et export NotebookLM

- **Worker** : `GET /api/weekly?week=YYYY-Www` (semaine ISO, fuseau Europe/Paris) : minutes écoutées (progression existante),
  contenus terminés, notes créées ou modifiées, articles lus ou enregistrés, passages ou citations liés à des notes,
  préparations publiées ; comparaison avec la semaine précédente. Calcul borné (index si nécessaire, migration 0022).
  Si un agrégat est trop coûteux à la volée, le préparer par le cron existant (sans dépasser les 10 ms).
- **Export** : `GET /api/weekly/export?week=…` renvoie un Markdown prêt pour NotebookLM (titres, sources avec liens, extraits
  des notes de la semaine, liste des contenus écoutés), en s'appuyant sur l'export v2 (`worker/src/routes/export.ts`,
  `worker/src/export/`) sans le dupliquer ; aucune donnée d'une autre semaine.
- Mots appris : **hors périmètre** (I1 attend le travail vocabulaire de l'utilisateur) ; prévoir seulement un champ vide documenté.
- Fichiers : nouveau module `worker/src/weekly/`, route, migration 0022 si besoin, tests.
- Acceptation : semaine vide, semaine à cheval sur un changement d'heure, notes en corbeille exclues, Markdown stable (test
  d'instantané), aucune fuite de données d'autres tables.
