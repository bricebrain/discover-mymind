# Chantier A — Dossiers multisources : contrat

Branche `opus/dossiers-a`. Base : travail non commité de Codex (migration 0013, `worker/src/dossiers/`, extensions des
contrats), complété par Claude Opus le 19 octobre 2026. Première livraison : sélection **manuelle** des sources et
synthèse commune ; pas de suggestion automatique (idée G).

## 1. Dossier, exécution, contenu

- **Dossier** (`dossiers`) : titre + liste ordonnée de 2 à 6 références `{type: episode|content|reflection, id}`,
  `version` incrémentée à chaque modification (`PATCH` avec la version lue, sinon `409 conflict`).
- **Exécution** (`dossier_runs`) : instantané figé au moment de « Préparer » — titre, sources capturées
  (`sources_json`), options. Clé d'unicité `(dossier, version, options)` : relancer les mêmes options sur la même
  version retrouve la même exécution, donc la même demande de file (pas de doublon).
- **Demande** : `prepare_queue.kind = 'dossier'`, `ref = <runId>`. Bail, heartbeat, échec, reprise : inchangés.
- **Contenu publié** : un contenu par exécution, `id = dossier-<runId>`, `sourceType = 'dossier'`,
  `sourceRef = 'dossier:<runId>'`. Modifier le dossier pendant un traitement crée une nouvelle version mais
  n'affecte pas l'exécution en cours : le résultat reste rattaché aux sources réellement traitées.

## 2. Sources

| Type | Capture (Worker) | Préparation (Atelier) |
|---|---|---|
| `episode` (podcast) | URL audio, transcription du flux, langue | téléchargement, sous-titres du flux sinon MacWhisper — même cache que la préparation de l'épisode seul |
| `episode` (vidéo de chaîne YouTube) | identifiant vidéo | yt-dlp, sous-titres manuels sinon MacWhisper — même cache |
| `reflection` | texte de la note (≥ 20 caractères) | découpage en passages |
| `content` (préparé) | segments de la version **source** de la publication courante | utilisés tels quels |

- Refus à la création, à la modification et à la capture : source supprimée, vide, transcription > 1 Mo, total
  > 150 000 caractères, doublon (y compris un épisode et sa version préparée), un dossier comme source.
- Une source devenue indisponible entre la création et « Préparer » fait échouer la capture (`422 source_missing`) :
  rien n'est mis en file.

## 3. Options

`coverage ∈ {condensed, essentials}` (pas d'intégral), `level`, `style`, `targetMinutes` comme les épisodes.
`faithful` et `keepOriginalCopy` refusés : il n'y a pas d'original unique à traduire ou copier.

## 4. Manifeste et segments (rétrocompatibles)

- `content.sources` (dossier seulement, 2 à 6) : `{id: d1…d6, type, ref, title, capturedAt, sha256, publicationId?, variantKey?}` ;
  `sha256` = empreinte du texte source effectivement utilisé par l'Atelier.
- Variante **source** du dossier : tous les passages des sources bout à bout, identifiants `d<k>-<id d'origine>`,
  sans audio (`startMs`/`endMs` nuls) ; chaque passage porte
  `provenance: {sourceId, segmentId, startMs, endMs}` — l'instant dans l'**original** quand il est connu, sinon nul.
  `provenance` est refusée hors de la variante source d'un dossier ; `sourceId` doit exister dans `content.sources`.
- Variante **adaptation** : inchangée ; `sourceSegments` cite les passages `d<k>-…`. La provenance d'un paragraphe
  (une ou plusieurs sources) se déduit de ces renvois — aucune précision inventée : si la transcription d'origine
  n'a pas d'horodatage, le renvoi mène à la source, pas à un instant.
- Langue de la variante source : langue majoritaire des passages (en mots).
- Anciens manifestes (podcast, YouTube, note) : inchangés et toujours valides.

## 5. Synthèse

Même chaîne que les épisodes (plan, extraction exhaustive par blocs, écriture, juge indépendant, voix), avec des
consignes propres aux dossiers : chaque passage est présenté avec le titre de sa source ; un point repris par
plusieurs sources est dit une fois et cite tous ses passages ; un désaccord (chiffre, interprétation, prévision) est
**explicité et attribué** (« selon X…, tandis que Y… ») ; aucune affirmation d'une seule source n'est présentée comme
un consensus. Le juge signale un désaccord perdu dans `lostNuances`.

## 6. Publication et contrôles Worker

- `content.id = 'dossier-' + runId`, `sourceRef` cohérent, `content.sources` présent et seulement pour un dossier.
- Au commit : l'exécution existe, la demande liée porte `kind='dossier'` et `ref=runId`, et `content.sources`
  reprend exactement les sources capturées (même ordre, types, références).
- Publication atomique, idempotence par révision et reprise : mécanismes existants.

## 7. Lecteur

Contenu ouvert par `/library/dossier-<runId>`. Sous chaque paragraphe, les sources citées (« Source 2 · 12:30 »)
renvoient à l'original : épisode dans Explorer, contenu préparé dans la bibliothèque, note dans My Mind.
Bibliothèque : onglet « Dossiers » (créer, modifier, préparer, suivre les exécutions).

## 8. Limites de la première livraison

- Pas de suggestion automatique de sources (G) ; pas de préparation sans Mac (D).
- Pas de saut automatique à l'instant exact dans l'original depuis le paragraphe : l'instant est affiché.
- Une vidéo YouTube ajoutée par lien (sans chaîne suivie) entre dans un dossier via son contenu préparé.
