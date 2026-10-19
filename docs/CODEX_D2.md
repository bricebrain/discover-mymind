# D2 — Articles Explorer comme sources directes de dossier

19 octobre 2026. Branche `codex/d2` dans les deux dépôts.
Worktrees : `/private/tmp/discover-mymind-codex-d2` et `/private/tmp/convert-codex-d2`.
Bases : Discover `b858438`, Atelier `85a17fa` (`feat/lot1`). Les checkouts principaux restent inchangés.

## Création pour le mode sélection d’Opus

`POST /api/dossiers` (session habituelle), en un appel :

```json
{
  "sources": [
    { "type": "article", "id": "aaaaaaaaaaaaaaaaaaaa" },
    { "type": "episode", "id": "eeeeeeeeeeeeeeeeeeee" }
  ]
}
```

- `sources` : liste ordonnée de **2 à 6** références `episode | content | reflection | article`.
- `article.id` : identifiant Explorer (20 caractères hexadécimaux), jamais l’URL ni l’ID de sa note.
- `title` facultatif : absence → **Nouveau dossier**. Si présent, chaîne non vide après trim, 200 caractères maximum.
- Réponse `201 { dossier: { id, title, version, sources, createdAt, updatedAt } }` inchangée.
- Validation des références, existence, doublons et limites à la création ; le texte incomplet n’empêche pas de créer.
- `PATCH /api/dossiers/:id` reste inchangé : `title`, `sources`, `version` obligatoires ; conflit → 409.
- `POST /api/dossiers/:id/prepare` reste un appel séparé, avec les options habituelles condensé/essentiel.
  Aucun lancement IA implicite à la création. Réponse habituelle `{ item }`, 201 pour une nouvelle demande, 200 si active.

## Candidats et déduplication

`GET /api/dossier-sources?q=&offset=` conserve recherche sur le titre, ordre récent, pages de 30 et `nextOffset`.
Les articles portent `{ type: "article", id, title, label: "Article · The Guardian", date }` (journal réel).

Choix : **préférer l’article Explorer**. Dès qu’un article référence une note par `reflection_id`, cette note est masquée
parmi les candidats, même si son titre a changé. Les dossiers historiques peuvent toujours référencer cette note.
Un article supprimé ne masque plus sa note. Un article inaccessible reste candidat ; son lancement est refusé explicitement.
La capture refuse aussi article + note liée, article + version préparée de cette note, ainsi que les doublons déjà refusés
(épisode/version préparée). Les références distinctes restent dans l’ordre envoyé.

## Capture et circuit des textes incomplets

Circuit annoncé avant le code : attente persistante côté Worker via la file de récupération Atelier existante.
Aucune nouvelle route, aucun schéma D1 modifié : **pas de migration 0025** ; 0024 reste réservée à R.

Au lancement, l’exécution conserve les autres sources et les métadonnées de l’article :
`id: dN`, `type: article`, `kind: article`, `ref`, `title`, `language`, `sourceName` (éditeur), `sourceUrl`,
`publishedAt` (nullable), `capturedAt`, `origin: article`, `contentStatus`, et `text` seulement si complet.

| État au lancement | Comportement |
| --- | --- |
| `complete` | Texte copié dans l’exécution immédiatement, sans récupération de page. Texte vide → 422. |
| `none`, `feed`, `partial` | Passage à `pending`, même si un extrait existe déjà. Extrait exclu de la capture. |
| `pending` | Réutilisation de la récupération en attente ; aucune deuxième file. |
| `unavailable` | **422 `article_unavailable`** avec message demandant de retirer l’article. Aucune nouvelle exécution/file. |

L’exécution et les passages à `pending` sont enregistrés ensemble par batch D1. La demande de préparation reste
`pending`, sans bail ni tentative consommée, et ne bloque pas les demandes prêtes. Le Mac, quand son préparateur
normal est inactif, traite `GET /atelier/article-texts`, puis publie le résultat par `POST /atelier/article-texts/:id`.
Le mode Atelier « sources seulement » ne traite pas cette file ; utiliser le préparateur normal pour débloquer l’attente.

À l’appel de bail suivant, le Worker complète le JSON de l’exécution **uniquement lorsque tous les articles sont complets**,
puis autorise le bail. Il conserve les titres, métadonnées et autres sources capturés au lancement ; seules les entrées
article incomplètes reçoivent leur texte intégral et `contentStatus: complete`. `capturedAt` reste la date de demande ;
le texte absent à cette date est explicitement différé jusqu’à sa récupération. Comparaison de l’ancien JSON avant
mise à jour : une capture complétée ne peut pas être remplacée par un autre Atelier. Les limites cumulées (150 000
caractères de texte / 700 000 de JSON) sont revérifiées après récupération, avant tout bail.

Si la récupération rend `partial` ou `unavailable`, ou si l’article disparaît pendant l’attente, la demande devient
`failed` avec message clair, sans appel IA. Elle ne synthétise jamais l’extrait et ne redemande pas automatiquement
la même page. Retirer/remplacer la source et modifier le dossier pour créer une nouvelle version ; une nouvelle
version peut redemander une source partielle. Les options/version identiques retrouvent la même exécution figée.
Une panne réseau laisse les règles existantes de récupération Atelier s’appliquer ; aucun délai artificiel de préparation.

Après capture complète, suppression ou modification de l’article n’altère pas l’exécution. Dans la liste et le détail
du dossier, une référence supprimée reçoit `title: null`, que l’UI existante affiche comme « Source indisponible ».
Une suppression avant capture fait échouer le lancement (`422 source_missing`).

## Atelier, publication et PWA

- `discover_dossier.py` dirige `kind: article` vers `discover_source.preparer_texte`, sans téléchargement.
  Il refuse défensivement un instantané article non complet avant la synthèse.
- Le texte conserve les paragraphes séparés par lignes vides issus de `discover_articles.py` ; le découpeur texte
  existant produit les passages sans fusionner ces paragraphes. La langue capturée est conservée pour les articles.
- Cache isolé `article-<id>`, attribution dans les consignes `Titre (article, Journal)` et titre publié `Journal · Titre`,
  comme les notes Article. Aucune nouvelle récupération, aucun cookie ni contournement de paywall.
- Provenance, `sourceSegments`, empreintes, quiz, coûts, bail et publication restent communs aux autres dossiers.
  `content.sources[].type` accepte maintenant `article` dans le schéma partagé et les types Worker.
  Le `sourceType` du contenu final reste `dossier`, et `prepare_queue.kind` reste `dossier`.
- Fixture partagée : `contracts/fixtures/valid-dossier-article.json`, validée côté TS et Python.
- PWA : uniquement `DossierSourceType`, `DossierSource`, `SOURCE_TYPES.article` et
  `sourceLink(article) = /?a=<ref>` dans les quatre fichiers autorisés. Aucun mode sélection implémenté ici.
- Intégrer les deux branches avant de préparer des articles. L’Atelier doit utiliser les contrats Discover mis à jour
  (`DISCOVER_CONTRACTS_DIR` si les worktrees ne sont pas voisins sous leurs noms habituels).

## Fichiers

Worker : `src/dossiers/{sources,routes,candidates,article-texts}.ts`, intégration dans `src/queue/leases.ts`,
`src/publications/types.ts`, validateur manifeste généré, schéma et fixture partagés,
`test/{dossier-articles,contracts}.test.ts`.
PWA : les quatre fichiers explicitement autorisés par le brief.
Atelier : `discover_dossier.py`, `discover_source.py`, `tests/test_discover_dossier_e2e.py`, `docs/CODEX_D2.md`.

## Vérifications

- Worker : `npm test` → **339 tests réussis** (29 fichiers) ; `npx tsc --noEmit -p .` réussi.
- Atelier : `DISCOVER_CONTRACTS_DIR=/private/tmp/discover-mymind-codex-d2/contracts python3 -m unittest discover -s tests -q`
  → **254 tests réussis**. Les tests HTTP locaux nécessitent l’autorisation d’écouter sur 127.0.0.1.
- PWA : `npm test` → **160 tests réussis** (26 fichiers) ; `npx tsc --noEmit -p .` et `npm run build` réussis.
- `git diff --check` réussi dans les deux dépôts. Les avertissements existants de taille du bundle PWA,
  de faux HTTPError Python et de lecture d’audio en texte dans les tests Worker n’empêchent pas les suites de réussir.
- Le lot de résolution est borné à dix exécutions prêtes par appel de bail pour limiter la mémoire du Worker ;
  les dossiers encore en attente réseau ne prennent pas ces places.
Aucun déploiement, aucune migration en production ni aucun appel payant réel. Médias, IA, TTS et Worker sont simulés
pour le test de bout en bout ; les suites Worker utilisent D1/R2 locaux dans Miniflare.
