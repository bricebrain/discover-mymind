# Discover & My Mind — Phase 0 : architecture et contrats

> Statut : **v2, stratégie validée** (2026-10-17), avec les ajustements de la relecture.
> Nom technique provisoire : `discover`. Offre Cloudflare **gratuite** en première intention.
> Aucune fonctionnalité n'est développée avant la validation de cette v2.
> Ce document remplace, sur les points où il diffère, le cahier des charges initial.

**Changements de la v2** :
- collecte mesurée sur Workers (§ 7.1) ;
- évaluation B1 par simplicité et fidélité, sans seuil strict (§ 7.6) ;
- versions préparées : couverture × niveau × durée, synthèse en deux passes (§ 7.4, § 7.7) ;
- sécurité renforcée (§ 8) ;
- bail sur la file (§ 6.6) ;
- publication robuste (§ 6.5) ;
- variantes conservées (§ 6.3) ;
- My Mind minimal dès le lot 4 (§ 11) ;
- streaming officiel par défaut (§ 7.3) ;
- critères d'acceptation (§ 13) et matrice de cohérence (§ 14).

---

## 1. Vision recadrée

Trois verbes : **découvrir, consommer, réfléchir.**

| Brique | Rôle | Ne fait pas |
|---|---|---|
| **PWA** | Écouter et lire, sauvegarder, écrire ses réflexions | Aucune génération (ni LLM, ni TTS, ni transcription) |
| **Worker `discover`** | Stocker et servir, détecter les nouveaux épisodes, tenir la file « à préparer » | Aucun appel LLM en V1 |
| **Atelier** (`convert/`, app web Python locale sur le Mac) | **Tout le travail lourd** : téléchargement, transcription, traduction, adaptation, audio, publication | Pas de découverte de contenus |
| **EnglishFluency** | Entraînement (SRS, exercices, mots en contexte) | Inchangé ; reçoit, en option, des contenus publiés par l'Atelier |

Ce qui change par rapport au cahier des charges :
- **Explorer V1 = podcasts uniquement**, sans RSS d'articles (contenus tronqués et scraping parasite, la leçon de TechPulse).
- **Pas d'interface d'import dans la PWA** : l'Atelier publie directement.
- **3 onglets** : Explorer, Bibliothèque, My Mind, avec un mini-lecteur persistant.
- **Reporté après la V1** : collections, historique de versions des notes, édition hors ligne avec fusion de conflits, IA dans la PWA, plusieurs niveaux CEFR par contenu.
- **Aucun** Neon, embedding, GitHub Actions, scraping, clustering.

---

## 2. Architecture

```
  Apple Podcasts (annuaire, sans clé)          Éditeurs de podcasts (RSS + MP3 officiels)
            │ recherche / lookup                        │ RSS : 1 émission par minute, lecture partielle
            ▼                                           ▼
 ┌──────────────────────── Worker « discover » (Cloudflare) ───────────────────────┐
 │  /api/*  (PWA, session révocable)        /atelier/*  (Atelier, jeton Bearer)    │
 │  cron (1/min) : collecte, bails expirés, nettoyage                               │
 │  D1 : émissions, épisodes, contenus, publications, variantes, file, réflexions   │
 │  R2 (privé) : audios générés, segments, transcriptions des flux                  │
 └───────▲──────────────────────────────────────────────────────▲──────────────────┘
         │ HTTPS, même origine                                   │ bail sur la file / publication
 ┌───────┴─────────┐                                    ┌────────┴──────────────────────────┐
 │ PWA (téléphone) │ ── audio original : streaming ───▶ │  Atelier (Mac)                      │
 │ Explorer        │    officiel de l'éditeur (défaut)  │  MacWhisper · Gemini · Kokoro       │
 │ Bibliothèque    │                                    │  publie aussi, en option, vers ──▶  │ englishfluency-worker
 │ My Mind         │                                    └─────────────────────────────────────┘   (POST /content existant)
 └─────────────────┘
```

Règle : **ce qui est léger et automatique va dans le Worker, ce qui est lourd et choisi va dans l'Atelier.**

L'Atelier est le seul pont vers EnglishFluency.

---

## 3. Arborescence

```
discover-mymind/
├── docs/
│   ├── PHASE0_ARCHITECTURE.md
│   └── seed-shows.json              ← 36 émissions vérifiées le 2026-10-17
├── spikes/feed-probe/               ← sonde de mesure CPU (supprimée de Cloudflare, gardée comme trace)
├── contracts/
│   ├── manifest.schema.json         ← source de vérité du manifeste (§ 6.2)
│   ├── segments.schema.json
│   └── fixtures/                    ← cas valides et invalides, partagés TS et Python
├── worker/
│   ├── wrangler.jsonc               ← D1, R2, cron, static assets
│   ├── migrations/0001_init.sql
│   └── src/
│       ├── index.ts                 ← routage /api, /atelier, cron
│       ├── security/                ← sessions, limitation des connexions, CSRF, en-têtes, safeUrl, chemins
│       ├── shows.ts  feeds.ts  episodes.ts
│       ├── queue.ts                 ← file avec bail (§ 6.6)
│       ├── publications.ts          ← protocole § 6.5 et nettoyage
│       ├── manifest.ts  contents.ts  media.ts  progress.ts
│       ├── reflections.ts  search.ts  export.ts
│   └── test/                        ← vitest 4 + @cloudflare/vitest-plugin (successeur de vitest-pool-workers)
└── pwa/
    └── src/
        ├── app/  player/  explorer/  library/  mind/  shows/  settings/
        ├── api/                     ← client typé + TanStack Query
        ├── offline/                 ← IndexedDB (idb)
        └── types/
```

Ajouts côté Atelier (`convert/`), sans modifier le pipeline existant :

| Fichier | Rôle |
|---|---|
| `discover_cible.py` | Manifeste et protocole de publication § 6.5 |
| `discover_file.py` | Bail sur la file (§ 6.6), signal de vie, reprise |
| `podcast_episode.py` | Téléchargement validé de l'audio d'un épisode, normalisation (mono, 64 kbit/s) |
| `adaptation.py` | Versions préparées : intégral, condensé, essentiel ; deux passes (§ 7.4, § 7.7) |
| `adaptation_evaluation.py` | Fidélité du fond, puis accessibilité de la langue (§ 7.6) |
| `manifeste_validation.py` | Validation Python, testée contre `contracts/fixtures/` |

---

## 4. Modèle de données (D1)

Un seul utilisateur, donc pas de table `users`. Les textes longs vont dans R2. Les dates sont en ISO 8601 UTC.

```sql
-- ── Sécurité ────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,               -- HMAC-SHA256(SESSION_EPOCH, jeton) ; le jeton brut n'est jamais stocké
  label           TEXT,                           -- appareil (dérivé du User-Agent)
  created_at      TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,                  -- +30 jours, prolongé à l'usage
  expires_at      TEXT NOT NULL,                  -- +180 jours, jamais prolongé
  revoked_at      TEXT
);
CREATE TABLE login_attempts (
  bucket          TEXT NOT NULL,                  -- 'ip:<sha256(ip)>' ou 'global'
  window_start    TEXT NOT NULL,
  failures        INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  PRIMARY KEY (bucket, window_start)
);

-- ── Découverte ──────────────────────────────────────────────────────────────
CREATE TABLE shows (
  id                TEXT PRIMARY KEY,             -- slug ^[a-z0-9][a-z0-9-]{1,63}$
  title             TEXT NOT NULL,
  publisher         TEXT,
  apple_id          INTEGER,
  feed_url          TEXT NOT NULL UNIQUE,         -- validée par safeUrl (§ 8.4)
  language          TEXT NOT NULL CHECK (language IN ('fr','en')),
  category          TEXT NOT NULL,                -- tech | science | economy | news | football | stories
  image_url         TEXT,
  title_filter_json TEXT,                         -- ["PSG","Paris"] ; NULL = tous les épisodes
  auto_prepare      INTEGER NOT NULL DEFAULT 0,
  enabled           INTEGER NOT NULL DEFAULT 1,
  -- état de collecte (§ 7.1)
  etag              TEXT, last_modified TEXT,
  next_check_at     TEXT NOT NULL,                -- ordonnancement : la plus ancienne échéance passe en premier
  last_attempt_at   TEXT, last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  max_items         INTEGER NOT NULL DEFAULT 10,  -- baissé à 3 si une collecte n'aboutit pas
  last_error        TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE episodes (
  id               TEXT PRIMARY KEY,              -- hex(sha256(show_id|guid))[0..20]
  show_id          TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  guid             TEXT NOT NULL,
  title            TEXT NOT NULL,                 -- texte brut (balises retirées)
  description      TEXT,                          -- texte brut, 2 000 caractères maximum
  published_at     TEXT,
  duration_sec     INTEGER,
  audio_url        TEXT NOT NULL,                 -- enclosure officielle, validée par safeUrl
  image_url        TEXT,
  transcript_url   TEXT, transcript_type TEXT,    -- podcast:transcript (SRT/VTT)
  transcript_r2_key TEXT,                         -- segments convertis, en cache
  state            TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','seen','saved','dismissed')),
  content_id       TEXT REFERENCES contents(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL,
  UNIQUE (show_id, guid)
);
CREATE INDEX idx_episodes_recent ON episodes(published_at DESC);

-- ── Contenus préparés ───────────────────────────────────────────────────────
CREATE TABLE contents (
  id                     TEXT PRIMARY KEY,        -- donné par l'Atelier, ^[a-z0-9][a-z0-9-]{2,95}$
  title                  TEXT NOT NULL,
  original_language      TEXT NOT NULL,
  source_type            TEXT NOT NULL CHECK (source_type IN ('podcast','youtube','reflection')),
  source_ref             TEXT,                    -- 'episode:<id>' | 'reflection:<id>' | NULL
  source_url             TEXT,
  category               TEXT,
  editorial              TEXT NOT NULL DEFAULT 'news' CHECK (editorial IN ('news','discovery')),
  current_publication_id TEXT REFERENCES publications(id),  -- NULL = rien de visible
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  deleted_at             TEXT
);

-- Une publication = une révision complète d'un contenu
CREATE TABLE publications (
  id               TEXT PRIMARY KEY,
  content_id       TEXT NOT NULL,
  revision         TEXT NOT NULL,                 -- empreinte du manifeste (clé d'idempotence)
  seq              INTEGER NOT NULL,              -- ordre croissant par contenu (anti-retour en arrière)
  status           TEXT NOT NULL CHECK (status IN
                     ('uploading','committing','ready','failed','superseded','abandoned')),
  manifest_r2_key  TEXT NOT NULL,
  queue_item_id    TEXT,                          -- demande à clore au commit
  error            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  superseded_at    TEXT,
  UNIQUE (content_id, revision),
  UNIQUE (content_id, seq)
);

-- Fichiers d'une publication (permet la reprise, la réutilisation et le nettoyage sûr)
CREATE TABLE publication_files (
  publication_id   TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  path             TEXT NOT NULL,                 -- chemin relatif validé (§ 8.5)
  sha256           TEXT NOT NULL,
  size             INTEGER NOT NULL,
  content_type     TEXT NOT NULL,
  r2_key           TEXT NOT NULL,                 -- clé adressée par le contenu : blobs/<sha256>
  uploaded_at      TEXT,                          -- NULL = encore à envoyer
  PRIMARY KEY (publication_id, path)
);
CREATE INDEX idx_pubfiles_key ON publication_files(r2_key);

CREATE TABLE variants (
  publication_id   TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  variant_key      TEXT NOT NULL,                 -- identifiant stable d'une révision à l'autre : 'fr-source', 'en-b1'
  content_id       TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('source','faithful_translation','adaptation')),
  language         TEXT NOT NULL,
  cefr_level       TEXT,
  style            TEXT CHECK (style IN ('narration','dialogue')),
  coverage         TEXT NOT NULL DEFAULT 'full' CHECK (coverage IN ('full','condensed','essentials')), -- migration 0003 (lot 6)
  condensation_json TEXT,                         -- { targetMinutes, sourceMinutes, excludeAds } ; migration 0003
  derived_from     TEXT,                          -- variant_key d'une variante de la même publication
  segments_path    TEXT NOT NULL,
  audio_source     TEXT CHECK (audio_source IN ('r2','publisher_stream')),  -- NULL = sans audio
  audio_path       TEXT,                          -- si r2
  audio_url        TEXT,                          -- si publisher_stream (enclosure officielle)
  audio_sha256     TEXT,
  audio_origin     TEXT CHECK (audio_origin IN ('original','kokoro')),
  duration_ms      INTEGER,
  timing_source    TEXT NOT NULL CHECK (timing_source IN ('rss_srt','rss_vtt','macwhisper_srt','kokoro','none')),
  timing_status    TEXT NOT NULL DEFAULT 'exact' CHECK (timing_status IN ('exact','unverified','none')),
  excerpt_start_ms INTEGER, excerpt_end_ms INTEGER, -- réservé (mode extrait, hors V1)
  evaluation_json  TEXT NOT NULL DEFAULT '{}',    -- indicateurs § 7.6 (adaptations)
  generation_json  TEXT NOT NULL DEFAULT '{}',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publication_id, variant_key)
);

-- ── File « à préparer » avec bail (§ 6.6) ───────────────────────────────────
CREATE TABLE prepare_queue (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('episode','youtube','reflection')),
  ref              TEXT NOT NULL,                 -- episode_id, URL YouTube validée ou reflection_id
  options_json     TEXT NOT NULL,                 -- § 7.4
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','leased','done','failed','cancelled')),
  lease_token      TEXT,                          -- jeton de bail (exigé pour toute mise à jour)
  lease_owner      TEXT,                          -- identifiant de l'instance Atelier
  lease_expires_at TEXT,
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  stage            TEXT,                          -- download | transcribe | translate | adapt | tts | publish
  content_id       TEXT,
  error            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_queue_active ON prepare_queue(kind, ref) WHERE status IN ('pending','leased');
CREATE INDEX idx_queue_claim ON prepare_queue(status, lease_expires_at, created_at);

-- ── Écoute ──────────────────────────────────────────────────────────────────
CREATE TABLE listening_progress (
  target_type      TEXT NOT NULL CHECK (target_type IN ('episode','variant')),
  target_id        TEXT NOT NULL,                 -- episode_id ou '<content_id>:<variant_key>'
  audio_ref        TEXT NOT NULL,                 -- sha256 de l'audio ou URL officielle : position remise à 0 s'il change
  position_ms      INTEGER NOT NULL,
  duration_ms      INTEGER,
  completed        INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id)
);

-- ── My Mind ─────────────────────────────────────────────────────────────────
CREATE TABLE reflections (
  id                 TEXT PRIMARY KEY,            -- UUID créé côté client
  title              TEXT,
  body_md            TEXT NOT NULL DEFAULT '',    -- 100 000 caractères maximum
  kind               TEXT NOT NULL DEFAULT 'idea'
                     CHECK (kind IN ('idea','question','opinion','observation','synthesis')),
  question_state     TEXT CHECK (question_state IN ('to_explore','thinking','deepened')),
  tags_json          TEXT NOT NULL DEFAULT '[]',
  english_content_id TEXT REFERENCES contents(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,               -- sert au contrôle de conflit (409)
  deleted_at         TEXT                         -- corbeille 30 jours
);
CREATE TABLE reflection_links (
  reflection_id    TEXT NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL CHECK (target_type IN ('episode','content')),
  target_id        TEXT NOT NULL,
  variant_key      TEXT NOT NULL DEFAULT '',      -- '' = contenu entier
  segment_id       TEXT NOT NULL DEFAULT '',      -- '' = pas de passage précis
  quote            TEXT,                          -- 500 caractères maximum
  target_title     TEXT NOT NULL,                 -- garde le lien lisible si la cible disparaît
  created_at       TEXT NOT NULL,
  PRIMARY KEY (reflection_id, target_type, target_id, variant_key, segment_id)
);

-- ── Recherche ───────────────────────────────────────────────────────────────
CREATE VIRTUAL TABLE search_index USING fts5(
  kind, ref_id UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2');
```

Règles de cohérence :
- **Un contenu est visible si et seulement si `current_publication_id` pointe vers une publication `ready`.** Son statut affiché est celui de sa dernière publication : `uploading`/`committing` = « en préparation », `failed` = « échec ».
- **Les variantes visibles** sont celles de `current_publication_id`. Le passage d'une révision à l'autre se fait par **une seule mise à jour** de ce pointeur.
- **La suppression d'un contenu ne supprime jamais une réflexion.** Elle pose `deleted_at` sur le contenu ; les liens restent lisibles grâce à `target_title`.
- **La progression est propre à chaque audio.** Elle est remise à zéro si `audio_ref` change.
- **L'export** (§ 5.1) lit toutes ces tables, sauf la sécurité.

---

## 5. API du Worker

Toutes les entrées sont validées par un schéma, et les tailles sont plafonnées. Les erreurs ont la forme `{ error: { code, message } }`.

### 5.1 PWA (`/api/*`)

Une session est requise, sauf pour la connexion. Tout appel qui modifie quelque chose passe les contrôles CSRF du § 8.3.

| Méthode | Route | Rôle | Tables |
|---|---|---|---|
| POST | `/api/auth/login` | Phrase secrète → nouvelle session (limitée, § 8.2) | sessions, login_attempts |
| GET | `/api/auth/session` | Session courante (401 si aucune) : la PWA s'en sert pour afficher la connexion | sessions |
| POST | `/api/auth/logout` | Révoque la session courante | sessions |
| GET | `/api/auth/sessions` | Liste des sessions actives | sessions |
| DELETE | `/api/auth/sessions/:id` · POST `/api/auth/sessions/revoke-others` | Révocation | sessions |
| GET | `/api/explorer?category=&show=&lang=&state=&cursor=` | Épisodes récents | episodes, shows |
| GET | `/api/episodes/:id` | Détail, avec indicateur de transcription | episodes |
| GET | `/api/episodes/:id/transcript` | Texte brut du SRT/VTT du flux (`{ type, audioRef, text }`), récupéré une fois puis servi depuis R2 | episodes |
| POST | `/api/episodes/:id/state` | `seen` · `saved` · `dismissed` | episodes |
| POST | `/api/episodes/:id/prepare` | Demande de préparation (§ 7.4) | prepare_queue |
| GET · POST | `/api/shows` | Liste · abonnement | shows |
| POST | `/api/shows/resolve` | Nom, lien Apple ou URL RSS → candidats ou aperçu (sans enregistrer) | — |
| POST | `/api/shows/preview` | Aperçu d'un candidat choisi (8 derniers épisodes, durée médiane, rythme) | — |
| PATCH · DELETE | `/api/shows/:id` | Réglages · désabonnement (les épisodes sauvegardés sont gardés) | shows, episodes |
| GET · DELETE | `/api/queue` · `/api/queue/:id` | Suivi · annulation | prepare_queue |
| GET | `/api/library?type=&category=&status=&q=` | Contenus préparés et épisodes sauvegardés | contents, episodes |
| GET | `/api/contents/:id` | Contenu et variantes de sa publication courante | contents, variants |
| GET | `/api/contents/:id/variants/:key/segments` | Fichier de segments | variants, publication_files |
| GET | `/api/contents/:id/variants/:key/audio` | Audio R2 avec requêtes `Range` (ou 404 si streaming officiel) | variants, publication_files |
| PUT | `/api/progress` | `{ targetType, targetId, audioRef, positionMs, durationMs, completed }` | listening_progress |
| GET · POST | `/api/reflections` | Liste · création (id UUID fourni par le client) | reflections |
| GET · PATCH · DELETE | `/api/reflections/:id` | PATCH avec `baseUpdatedAt` → **409** si conflit | reflections |
| PUT · DELETE | `/api/reflections/:id/links` | Liens vers épisodes ou contenus | reflection_links |
| POST | `/api/reflections/:id/prepare` | Envoi explicite à l'Atelier | prepare_queue |
| GET | `/api/search?q=` | FTS5 | search_index |
| GET | `/api/export` | Export (JSON, avec le Markdown des notes) ; lot 4 : notes, liens, émissions, épisodes sauvegardés | toutes, sauf sécurité |
| POST | `/api/reflections/:id/restore` | Restaure une note de la corbeille (« Annuler ») | reflections |

Il n'y a **aucune route qui accepte une clé R2 venant du client**. Les fichiers sont toujours désignés par des identifiants (§ 8.5).

### 5.2 Atelier (`/atelier/*`, `Authorization: Bearer <ATELIER_TOKEN>`, cookies ignorés)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/atelier/ping` | Vérifie le jeton (lot 1) |
| GET | `/atelier/queue` | Suivi des demandes (sans jetons de bail) |
| POST | `/atelier/queue/lease` | `{ owner, sourceOnly? }` → prend **une** demande disponible, avec son bail (§ 6.6) |
| POST | `/atelier/queue/:id/heartbeat` | `{ leaseToken, stage }` → prolonge le bail |
| POST | `/atelier/queue/:id/fail` | `{ leaseToken, error, retryable }` |
| POST | `/atelier/queue/:id/release` | `{ leaseToken }` → rend la demande sans pénalité |
| POST | `/atelier/publications` | `{ manifest, queueItemId?, leaseToken? }` → publication et fichiers manquants |
| PUT | `/atelier/publications/:pid/files/:path` | Envoi d'un fichier (corps brut, `x-content-sha256`) |
| POST | `/atelier/publications/:pid/commit` | Bascule atomique (§ 6.5) |
| GET | `/atelier/publications/:pid` | État : fichiers reçus ou manquants |

---

## 6. Contrat Atelier → Worker

### 6.1 Principes

- **Format indépendant du moteur.** `generation` et `evaluation` sont informatifs ; le Worker ne s'en sert pas pour décider.
- **Construit à partir des bundles existants** : segments `s001…`, `variantId`, `audioRevision`.
- **Une seule source de vérité** : `contracts/*.schema.json`, avec des fixtures partagées entre les validateurs TypeScript et Python.

### 6.2 Manifeste `schemaVersion: 1`

Exemple : épisode français de 8 minutes avec ses trois variantes. L'original est en streaming officiel, les audios Kokoro sont dans R2.

```json
{
  "schemaVersion": 1,
  "content": {
    "id": "voix-de-l-economie-2026-10-16",
    "title": "La BCE face au ralentissement",
    "originalLanguage": "fr",
    "sourceType": "podcast",
    "sourceRef": "episode:k3f9a1c2e4b7d0a6m2q",
    "sourceUrl": "https://…/episode.mp3",
    "category": "economy",
    "editorial": "news",
    "rights": "personal_use"
  },
  "variants": [
    {
      "key": "fr-source", "kind": "source", "language": "fr",
      "cefrLevel": null, "derivedFrom": null,
      "segmentsFile": "segments/fr-source.json",
      "audio": { "source": "publisher_stream", "url": "https://…/episode.mp3", "origin": "original",
                 "durationMs": 482000, "timingSource": "macwhisper_srt" }
    },
    {
      "key": "en-faithful", "kind": "faithful_translation", "language": "en-GB",
      "cefrLevel": null, "derivedFrom": "fr-source",
      "segmentsFile": "segments/en-faithful.json",
      "audio": { "source": "r2", "file": "audio/en-faithful.mp3", "origin": "kokoro",
                 "durationMs": 455000, "timingSource": "kokoro" }
    },
    {
      "key": "en-b1", "kind": "adaptation", "language": "en-GB",
      "cefrLevel": "B1", "style": "narration", "derivedFrom": "fr-source",
      "coverage": "full",
      "segmentsFile": "segments/en-b1.json",
      "audio": { "source": "r2", "file": "audio/en-b1.mp3", "origin": "kokoro",
                 "durationMs": 301000, "timingSource": "kokoro" },
      "generation": { "provider": "gemini", "model": "gemini-3.1-flash-lite",
                      "promptVersion": "adaptation-v1", "blocks": 1, "createdAt": "2026-10-16T20:11:00Z" },
      "evaluation": { "meanSentenceWords": 12.4, "longSentenceRatio": 0.03, "frequentWordCoverage": 0.93,
                      "numbersMissingFromSource": [], "entitiesMissingFromSource": [],
                      "unsupportedClaims": [], "verdict": "ok" }
    }
  ],
  "files": {
    "segments/fr-source.json":   { "sha256": "…", "size": 18211, "contentType": "application/json" },
    "segments/en-faithful.json": { "sha256": "…", "size": 17630, "contentType": "application/json" },
    "segments/en-b1.json":       { "sha256": "…", "size": 9120,  "contentType": "application/json" },
    "audio/en-faithful.mp3":     { "sha256": "…", "size": 3640000, "contentType": "audio/mpeg" },
    "audio/en-b1.mp3":           { "sha256": "…", "size": 2408000, "contentType": "audio/mpeg" }
  },
  "removeVariants": []
}
```

La `revision` n'est pas écrite par l'Atelier : **le Worker la calcule** (sha256 du manifeste normalisé). Deux envois identiques donnent donc toujours la même révision.

Règles de validation du manifeste. **Une seule erreur fait refuser tout le manifeste** :

| Règle | Détail |
|---|---|
| Identifiants | `content.id` correspond à `^[a-z0-9][a-z0-9-]{2,95}$` ; `key` correspond à `^[a-z0-9][a-z0-9-]{1,31}$` et est unique |
| Variante source | **Exactement une** `kind = source`, dans `originalLanguage`, sans `cefrLevel` et sans `derivedFrom` |
| Traduction fidèle | `faithful_translation` : `derivedFrom` = la source, langue différente de la source, sans `cefrLevel` |
| Adaptation | `adaptation` : `cefrLevel` ∈ A2/B1/B2/C1 ou `null` (anglais non simplifié), `style` obligatoire, `derivedFrom` = une variante de ce manifeste, langue anglaise |
| Couverture | `coverage` ∈ `full` / `condensed` / `essentials` (défaut `full`) ; `condensed` et `essentials` ⇒ `kind = adaptation` et objet `condensation: { targetMinutes, sourceMinutes, excludeAds }` obligatoire ; `source` et `faithful_translation` sont toujours `full` |
| Fichiers | Tout `segmentsFile` et tout `audio.file` existe dans `files` ; chaque entrée de `files` est utilisée ; chemins conformes au § 8.5 |
| Audio | `source = r2` ⇒ `file` ; `source = publisher_stream` ⇒ `url` validée par safeUrl et égale à l'enclosure de l'épisode `sourceRef` |
| Tailles | 95 Mo maximum par fichier, 300 Mo par publication, 20 variantes au maximum |
| Variantes retirées | Une variante de la publication courante absente du nouveau manifeste **doit** figurer dans `removeVariants` (§ 6.3) |

### 6.3 Conservation explicite des variantes

- **Chaque variante qui existe est publiée et gardée** : source, traduction fidèle et adaptation. Exemples :
  - pour un épisode anglais : `en-source` (+ `fr-faithful`, en texte seulement, si demandée) (+ `en-b1`) ;
  - pour un épisode ou une note en français : `fr-source`, `en-faithful` si elle a été produite, et `en-b1`.
- **Rien ne disparaît en silence.** Une nouvelle révision qui omet une variante existante est refusée (`422 variant_dropped`), sauf si cette variante est listée dans `removeVariants`. L'Atelier ne la liste que si tu as demandé sa suppression.
- **Les clés de variantes** (`variant_key`) restent stables d'une révision à l'autre : la progression et les liens de My Mind suivent.

### 6.4 Fichier de segments

```json
{
  "schemaVersion": 1,
  "variantKey": "en-b1",
  "keyVocab": ["slowdown", "interest rate", "to weigh on"],
  "segments": [
    { "id": "s001", "speaker": "narrator",
      "text": "The European Central Bank has a difficult choice.",
      "fr": "La Banque centrale européenne doit faire un choix difficile.",
      "startMs": 0, "endMs": 3120 }
  ]
}
```

- `startMs` et `endMs` sont **relatifs à l'audio de cette variante**. Ils sont strictement croissants et compris dans `durationMs`. Ils valent `null` si `timingSource = none`.
- `fr` n'est permis **que s'il traduit exactement `text`**. C'est le cas pour la paire source / traduction fidèle (mêmes `id`) et pour l'adaptation, dont chaque phrase est traduite elle-même. Une adaptation ne porte jamais le français de la source.
- `speaker` est facultatif. Il vient de MacWhisper (`--speakers`), du SRT du flux, ou du style choisi pour l'adaptation.
- `sourceSegments` (facultatif, obligatoire pour `condensed` et `essentials`) : identifiants des segments de la variante source dont le segment est tiré, ex. `["s041","s042"]`.

### 6.5 Protocole de publication

Le protocole est idempotent et n'est jamais partiel. Les fichiers sont **adressés par leur contenu** : clé R2 `blobs/<sha256>`, jamais réécrite.

1. **Déclaration** : `POST /atelier/publications`.
   - Le Worker valide le manifeste (§ 6.2) et calcule `revision`.
   - Si `(content_id, revision)` existe déjà en `ready`, il répond `200 { status: "ready" }`. Si elle est en `uploading`, il **reprend cette publication**.
   - Sinon, il crée la publication en `uploading`, avec `seq = max(seq) + 1`, et ses lignes `publication_files`.
   - Un fichier dont le `sha256` est **déjà présent dans R2** (référencé par une publication non nettoyée, ou vérifié par `head`) est marqué reçu tout de suite : il n'est pas renvoyé.
   - Réponse : `{ publicationId, missing: [paths] }`.
2. **Envois** : `PUT …/files/:path`, en un seul envoi par fichier.
   - Les audios sont normalisés par l'Atelier (mono, 64 kbit/s), soit environ 30 Mo par heure. La taille maximale de requête de l'offre gratuite (100 Mo) n'est jamais atteinte.
   - Le Worker transmet le flux à `R2.put(blobs/<sha256>, body, { sha256 })`. **C'est R2 qui vérifie l'empreinte**, sans calcul côté Worker : un envoi interrompu ou corrompu est refusé, et rien n'est écrit.
   - La taille et le `content-type` sont comparés au manifeste. Si tout correspond, `uploaded_at` est rempli. Renvoyer un fichier déjà reçu ne fait rien.
3. **Commit** : `POST …/commit`.
   - **Verrou** : `UPDATE publications SET status='committing' WHERE id=? AND status='uploading'`. Si aucune ligne n'est modifiée, un autre commit est en cours ou terminé : réponse `409`.
   - **Vérification** : tous les `uploaded_at` sont remplis et chaque `blobs/<sha256>` existe (`head`). Sinon, retour en `uploading` et réponse `{ missing }`.
   - **Bascule en un seul `batch` D1** :
     1. insertion des `variants` de la publication ;
     2. `UPDATE contents SET current_publication_id=? WHERE id=? AND (current_publication_id IS NULL OR (SELECT seq FROM publications WHERE id=current_publication_id) < ?)`. Une révision **plus ancienne** que la révision courante ne peut jamais la remplacer : elle devient `superseded`.
     3. passage de l'ancienne publication en `superseded` (avec `superseded_at`), de la nouvelle en `ready` ;
     4. mise à jour de `episodes.content_id` ou `reflections.english_content_id` ;
     5. si un `queueItemId` est fourni avec son `leaseToken` valide, la demande passe en `done`.
4. **Échecs** : à n'importe quelle étape, la publication reste `uploading`, ou passe `failed` si l'erreur est définitive. **Relancer reprend là où on s'est arrêté.** La révision `ready` précédente reste visible jusqu'à la bascule.
5. **Nettoyage sûr (cron)** : un `blobs/<sha256>` n'est supprimé que si **aucune** publication `ready`, `uploading` ou `committing` ne le référence, ni aucune publication `superseded` depuis moins de **7 jours**. Ce délai laisse le temps aux lecteurs et aux téléchargements hors ligne en cours. Une publication `uploading` sans activité depuis 48 h passe `abandoned`. Les suppressions R2 ne commencent qu'**après** le changement de statut en D1, par lots de 20 au maximum par passage.

### 6.6 File « à préparer » avec bail

Cycle de vie d'une demande : `pending` → `leased` → `done`, `failed` ou `cancelled`.

- **Prise** (`POST /atelier/queue/lease`) : une seule requête atomique.
  ```sql
  UPDATE prepare_queue
     SET status='leased', lease_token=?, lease_owner=?, lease_expires_at=datetime('now','+15 minutes'),
         attempts=attempts+1, updated_at=datetime('now')
   WHERE id = (SELECT id FROM prepare_queue
                WHERE (status='pending'
                       OR (status='leased' AND lease_expires_at < datetime('now')))
                  AND attempts < max_attempts
                ORDER BY created_at LIMIT 1)
  RETURNING *;
  ```
  Les dates sont passées par le Worker en ISO 8601 (paramètres `?`), comme partout ailleurs, plutôt que `datetime('now')`, dont le format diffère. La réponse contient tout ce qu'il faut pour traiter la demande : URL de l'enclosure, transcription du flux si elle existe, texte de la note, options.
- **Signal de vie** toutes les 2 minutes, avec `stage`. Chaque signal prolonge le bail de 15 minutes. Un signal avec un mauvais `leaseToken` reçoit `409 lease_lost` : l'Atelier arrête alors ce travail **sans rien publier**.
- **Récupération automatique** : un bail expiré, après un crash, un Mac en veille ou une fermeture de l'Atelier, rend la demande disponible à la prise suivante. Le cron fait aussi passer en `failed` les demandes qui ont atteint `max_attempts` (3), avec la dernière erreur.
- **Garde contre les écritures périmées** : `fail`, `release` et la clôture au commit exigent le `leaseToken` courant. Une ancienne instance ne peut pas écraser le travail d'une nouvelle.
- **Côté Atelier** : au démarrage, il reprend ses travaux locaux interrompus seulement si le bail lui appartient encore. Sinon, il les abandonne. Les fichiers intermédiaires déjà produits (audio téléchargé, transcription) sont réutilisés par empreinte.
- **Point de reprise historique du lot 8** : le consommateur prend les demandes avec `sourceOnly: true`. Après téléchargement, normalisation et transcription, il rend le bail avec `sourceReady: true` : la demande reste `pending`, étape `source_ready`, pour la génération du lot 9. Elle n’est pas présentée comme une version anglaise achevée.
- **Publication liée à un bail** : les envois de fichiers et le commit exigent aussi l’en-tête `X-Discover-Lease-Token`. Une publication `uploading` de la même demande est réutilisable avec le nouveau bail ; l’ancienne instance reste refusée, même après ce rattachement.
- **Implémentation et utilisation** : [Lot 8 — File](LOT8_QUEUE.md). Les notes My Mind seront mises en file au lot 10 ; le lot 8 traite les épisodes.

---

## 7. Collecte et préparation

### 7.1 Collecte des épisodes : mesures réelles et conception

**Mesures du 2026-10-17** : sonde déployée temporairement sur le compte, sur les 29 émissions de la liste d'alors (Power On, retiré depuis, compris) (détails dans `spikes/feed-probe/README.md`).

| Approche | Temps CPU mesuré | Compatible avec l'offre gratuite (10 ms) |
|---|---|---|
| Analyse du flux complet | 22 à 99 ms par gros flux | ❌ |
| Lecture en flux, 15 épisodes, 29 émissions en une exécution | 74 ms | ❌ |
| Lecture en flux, 15 épisodes, 3 émissions en une exécution | 15 à 25 ms | ❌ |
| **Lecture en flux, 1 émission par exécution** | médiane **3 ms**, 90 % ≤ 6 ms, max **15 ms** | ✅ en général, ⚠️ pour le pire cas |
| Réponse `304` | 26 émissions sur 29 la supportent | ✅ quasi gratuit |

Le compte n'a pas interrompu les exécutions à 74–99 ms. Son offre réelle n'est donc pas confirmée, mais **la conception vise 10 ms** dans tous les cas.

**Conception retenue (offre gratuite) :**
- **Cron toutes les minutes, une seule émission par exécution** : celle dont `next_check_at` est la plus ancienne. Avec 36 émissions, chacune est vérifiée environ toutes les **36 minutes** (40 minutes au plafond de 40 abonnements).
- **Échéance avancée avant la requête** (`next_check_at = now + 30 min`, `last_attempt_at = now`), puis requête. Si une exécution est interrompue pour dépassement de CPU, la même émission ne bloque pas la file.
- **Requête conditionnelle** avec `ETag` / `Last-Modified` : un `304` met fin à la vérification.
- **Lecture en flux, arrêtée dès le premier GUID déjà connu**. En régime normal, on ne lit que 1 à 3 épisodes. Au premier passage, 10 épisodes au maximum (`max_items`). Le reste du fichier n'est jamais téléchargé.
- **Extraction sans expressions régulières sur tout l'épisode** : recherche de balises par `indexOf`, description coupée à 2 000 caractères *avant* le nettoyage. C'est le principal coût du pire cas mesuré (Tech Café : des descriptions très longues).
- **Auto-correction** : si `last_attempt_at` avance sans `last_success_at` deux fois de suite, ce qui signale un dépassement probable, `max_items` passe à 3. Après 5 échecs, la vérification se fait une fois par jour.
- **Garde-fous réseau** : délai de 10 s, 1 Mo lu au maximum, 3 redirections au maximum (chacune revalidée par safeUrl).
- **Filtres de titre** et **rétention** : les 10 derniers épisodes par émission, 30 jours au maximum, sauf ceux qui sont sauvegardés ou préparés. La catégorie **Histoires** conserve les 10 derniers épisodes sans limite d’âge pour permettre l’écoute des archives.

Ce que ça représente pour l'offre gratuite : 1 440 exécutions de cron par jour, et quelques centaines d'écritures D1 par jour. C'est très en dessous des quotas (100 000 requêtes par jour, 100 000 écritures D1 par jour).

**Solution de repli**, dans cet ordre :
1. Si des dépassements persistent malgré `max_items = 3` : pour l'émission concernée seulement, **analyse limitée au début du flux** (on coupe après 64 Ko).
2. Si l'offre gratuite ne suffit toujours pas en usage réel (mesure des `exceededCpu` dans les journaux pendant le lot 2) : **Workers Paid à 5 $/mois**. On repasse alors à des lots de 30 émissions toutes les 15 minutes (74 ms mesurés), sans aucun changement de code au-delà de deux constantes.

À vérifier au lot 1 : le nombre de crons déjà utilisés sur le compte (EnglishFluency et TechPulse en ont). Un seul cron est utilisé ici : la collecte, l'expiration des bails et le nettoyage tournent tous dans le même déclencheur.

### 7.2 Ce qui est disponible sans l'Atelier

- **L'audio officiel en streaming**, directement depuis l'URL de l'éditeur.
- **La transcription du flux** (SRT/VTT : Bloomberg, Better Offline, T'as qui en Histoire ?) : récupérée par le Worker à la première ouverture et gardée **telle quelle** dans R2 (`transcripts/<episode_id>.srt|vtt`). C'est la PWA qui l'analyse et regroupe les répliques en segments (environ 220 caractères, nouveau segment à chaque changement d'intervenant ou après 1,5 s de pause) : aucun calcul côté Worker.
- **Constat du lot 5 (2026-10-17)** : les publicités dynamiques sont la règle. Bloomberg Tech diffusé 47:18 contre 43:18 transcrits ; T'as qui en Histoire ? 18:59 contre 18:36. Le surlignage automatique ne s'active donc que si la durée réelle correspond (±1,5 s). Sinon, la transcription s'affiche avec un bouton **« Caler le texte »** : on touche la phrase entendue, le décalage s'applique à tout le texte, et on recale si une publicité au milieu le fait dériver. Le calage vaut pour l'écoute en cours (non enregistré).

### 7.3 Streaming officiel par défaut

- **L'audio original n'est pas copié** : la variante source utilise `audio.source = "publisher_stream"`, avec l'URL officielle. Seuls les audios générés par l'Atelier (Kokoro) sont stockés dans R2.
- **Synchronisation du texte avec l'audio officiel.** Les publicités dynamiques peuvent décaler le fichier diffusé par rapport à celui que l'Atelier a transcrit. On le contrôle ainsi :
  - la variante est publiée avec `timing_status = 'unverified'` ;
  - à la lecture, la PWA compare la durée réelle du fichier officiel à `durationMs` ;
  - **écart ≤ 1,5 s** : surlignage synchronisé activé ;
  - **sinon** : transcription affichée sans surlignage, avec la mention « texte non synchronisé (publicités variables) ».
- **Copie privée de l'original dans R2**, en option seulement, contenu par contenu : case « garder une copie synchronisée » dans l'Atelier, pour un épisode dont la synchronisation compte vraiment. Elle n'est jamais faite par défaut.
- **Hors ligne** : seuls les audios stockés dans R2 sont téléchargeables. L'original officiel reste en streaming.

### 7.4 Options de préparation : couverture × niveau × durée

Trois réglages **indépendants** (décision du 2026-10-17, suite à la note « version condensée ») :

| Réglage | Valeurs | Défaut |
|---|---|---|
| **Couverture** (`coverage`) | `full` = intégral · `condensed` = condensé (10 à 15 min, explications et nuances gardées) · `essentials` = l'essentiel (3 à 5 min) | selon la durée, ci-dessous |
| **Niveau** (`level`) | A2, B1, B2, C1, ou `original` (anglais non simplifié) | **B1** |
| **Durée cible** (`targetMinutes`) | condensé : 8 à 20 min · essentiel : 3 à 6 min | condensé **12 min**, essentiel **4 min** |

Style d'écriture : **narration** par défaut, dialogue en option.

**Une seule version préparée par défaut** pour un épisode, choisie selon sa durée ; les autres se demandent à la carte :

| Épisode | Préparé par défaut | À la demande |
|---|---|---|
| ≤ 25 min (seuil réglable) | **Intégral · B1** | Anglais fidèle (sources FR), L'essentiel |
| > 25 min | **Condensé · B1 · ~12 min** | L'essentiel, Intégral |
| Émission marquée « journal » (ex. Daybreak) | **L'essentiel · B1 · ~4 min** | Condensé |
| Réflexion My Mind | Intégral · B1 | Anglais fidèle |

Pour un épisode anglais, l'original reste écoutable avec sa transcription ; la version préparée s'y ajoute. Le mode « en plusieurs parties » est **abandonné** (le condensé le rend inutile) ; le mode « extrait » passe hors V1.

`options_json` :

```json
{ "coverage": "full|condensed|essentials", "level": "B1", "style": "narration|dialogue",
  "targetMinutes": 12, "faithful": false, "keepOriginalCopy": false }
```

Validé par le Worker : `targetMinutes` dans les bornes de la couverture, `faithful` réservé aux sources françaises.

**Préparation automatique** : seulement pour les émissions `auto_prepare` (au départ, L'édito éco), avec leur réglage par défaut.

### 7.5 Chaîne dans l'Atelier

```
bail sur la file ─▶ téléchargement validé de l'enclosure (§ 8.4) ─▶ normalisation mono 64 kbit/s
   ─▶ transcription : SRT/VTT du flux > sous-titres YouTube > MacWhisper --speakers
   ─▶ segments source (horodatage.py)
   ─▶ anglais fidèle (traduction segmentée existante)                    [si demandé]
   ─▶ passe 1 : extraction par blocs, avec renvois aux segments (§ 7.7)  [intégral long, condensé, essentiel]
   ─▶ passe 2 : script à la couverture, au niveau et à la durée cibles
   ─▶ évaluation : fidélité puis langue (§ 7.6)
   ─▶ Kokoro segment par segment, une voix par intervenant                → timings exacts
   ─▶ manifeste ─▶ publication (§ 6.5) ─▶ (option) POST /content vers EnglishFluency
   (un signal de vie à chaque étape et au moins toutes les 2 minutes)
```

**Bénéfice induit** : l'audio préparé est généré segment par segment, ses timestamps sont **exacts par construction**. Les publicités en sont absentes (consigne d'ignorer les messages promotionnels) : le texte est toujours surligné en rythme. L'original reste disponible tel quel, avec « Caler le texte » (§ 7.2).

### 7.6 Évaluation : fidélité du fond, puis accessibilité de la langue

Le fond et la langue sont évalués **séparément**. B1 signifie « information sérieuse expliquée dans une langue plus accessible », pas « information simpliste ». **On évalue, et on refuse seulement ce qui est cassé.**

**Cinq règles données au générateur** (et vérifiées par le juge) :
1. Conserver les faits importants, les chiffres et les relations de cause à effet.
2. Préserver les explications indispensables pour comprendre le sujet.
3. Conserver les principaux points de vue quand les intervenants ne sont pas d'accord.
4. Ne rien inventer, et ne pas présenter comme certain ce qui est hypothétique.
5. Respecter la durée cible sans sacrifier l'essentiel ; si c'est impossible, le **signaler** (`tooShortForSubject`) et recommander une version plus longue.

Consignes complémentaires : narration fluide plutôt qu'une liste de faits ; **ignorer les messages promotionnels** (publicités, parrainages, appels à s'abonner), sans écarter une information journalistique qui leur ressemblerait (une annonce d'entreprise est un fait, pas une publicité).

**Contrôles bloquants** (relance automatique de la partie concernée) :
- schéma JSON invalide ;
- segment sans `text` ou sans `fr` ;
- intervenant incompatible avec le style ;
- longueur hors de **±20 %** de la cible en mots (cible = `targetMinutes` × débit mesuré de la voix Kokoro, environ 130 mots/min au départ) ;
- paragraphe du script sans renvoi à au moins un segment source (couverture condensée ou essentielle).

**Fidélité** :
- **Contrôles déterministes, gratuits** : chaque nombre, date, pourcentage et nom propre doit apparaître dans les segments sources cités (`numbersMissingFromSource`, `entitiesMissingFromSource`).
- **LLM juge** (OpenAI, ou un second appel Gemini) : compare chaque paragraphe à ses passages sources ; liste les affirmations absentes (`unsupportedClaims`), les idées principales omises (`omittedKeyPoints`), les nuances perdues (hypothèse présentée comme certaine, désaccord effacé). Activé par défaut pour les couvertures condensée et essentielle.

**Accessibilité de la langue** (avertissements, jamais un refus à eux seuls) :

| Indicateur | Cible indicative en B1 |
|---|---|
| Longueur moyenne des phrases | 8 à 18 mots |
| Phrases de plus de 25 mots | moins de 10 % |
| Mots hors du vocabulaire fréquent | ≤ 10 %, hors noms propres et `keyVocab` |
| Temps et tournures complexes repérés | signalés |

Le vocabulaire fréquent vient du référentiel d'EnglishFluency (`GET /words`, environ 4 000 mots, mis en cache par l'Atelier).

**Verdict** : `ok` (publiable, y compris en auto-préparation) · `review` (à relire dans l'Atelier : accepter, regénérer, corriger) · `rejected` (regénéré). Une version `review` n'est **jamais publiée automatiquement**. La durée réelle est mesurée après Kokoro et publiée.

### 7.7 Synthèse en deux passes, avec renvois à la source

- **Passe 1, extraction bloc par bloc** (toujours pour condensé et essentiel ; pour l'intégral, dès que la source dépasse ~6 000 mots ou 50 % de la limite de sortie du modèle) :
  - blocs d'environ 1 200 à 1 800 mots, **toujours aux limites des segments**, de préférence à un changement d'intervenant ou à une pause de plus de 1,5 s ;
  - pour chaque bloc : thèmes, faits, chiffres, explications, arguments, exemples, points de désaccord, passages promotionnels à ignorer, **chacun avec les identifiants des segments d'origine** ;
  - un premier appel léger fixe le **plan** de l'épisode (intervenants, noms propres et leur orthographe, glossaire) que reçoivent tous les blocs.
- **Passe 2, écriture** : un appel construit le script global à partir des extractions (pas de la transcription brute), à la couverture, au niveau et au nombre de mots visés. Chaque paragraphe garde ses renvois `sourceSegments`. Cela évite d'oublier le milieu d'un long épisode.
- **Intégral** : écriture bloc par bloc (le plan et les deux dernières phrases du bloc précédent assurent la continuité), segments renumérotés `s001…` sur l'ensemble ; seul le bloc fautif est relancé.
- **Budget** : nombre de blocs et tokens dans `generation`. Quota Gemini épuisé : arrêt à la fin de l'étape en cours, la demande retourne à la file.
- **Plus tard (hors V1)** : la PWA pourra proposer « écouter ce passage dans l'original » grâce aux renvois.

### 7.8 Fournisseurs

| Usage | Principal | Secours |
|---|---|---|
| Transcription | SRT/VTT du flux, sinon MacWhisper (local) | Deepgram : hors V1 (§ 15) |
| Traduction, adaptation, plan, notes | Gemini (quota gratuit, puis crédit) | OpenAI → DeepSeek / OpenRouter → copier-coller |
| Juge de fidélité | OpenAI | Second appel Gemini |
| Audio anglais | Kokoro (local) | — |

Le Worker n'appelle **aucun** LLM en V1.

---

## 8. Sécurité

### 8.1 Sessions révocables

> **Désactivée temporairement (2026-10-17, choix du propriétaire)** : `AUTH_DISABLED = "true"` dans `wrangler.jsonc`.
> `/api` est alors en accès libre et la PWA saute l'écran de connexion. Restent actifs : les contrôles CSRF,
> le jeton de l'Atelier et les en-têtes de sécurité. Pour réactiver : remettre `"false"` et redéployer ;
> `APP_PASSPHRASE` est toujours enregistrée, et tout ce qui suit s'applique de nouveau.


- **Connexion par une phrase secrète** de 24 caractères minimum, stockée en secret Wrangler (`APP_PASSPHRASE`). La comparaison se fait en temps constant, sur des empreintes HMAC. Il n'y a pas de hachage coûteux, incompatible avec 10 ms de CPU, puisque le secret n'est stocké nulle part ailleurs.
- **La session est un jeton aléatoire de 256 bits**, dans le cookie `__Host-discover_session` (`Secure; HttpOnly; SameSite=Strict; Path=/`). Seule son empreinte HMAC-SHA256 (clé `SESSION_EPOCH`) est en D1. Elle expire après 30 jours sans activité, et au maximum après 180 jours.
- **Révocation** :
  - déconnexion ;
  - « déconnecter les autres appareils » ;
  - révocation d'une session précise depuis Réglages ;
  - **révocation globale d'urgence** : changer `SESSION_EPOCH` (secret) invalide toutes les sessions, puisque plus aucune empreinte ne correspond.
- **Le cookie est renouvelé** (nouveau jeton) à la connexion. `last_seen_at` n'est écrit qu'une fois par heure au plus, pour économiser les écritures D1.

### 8.2 Limitation des connexions

- **Par IP** (empreinte) : 5 échecs en 15 minutes ⇒ blocage de 15 minutes, puis délai doublé à chaque nouveau blocage, jusqu'à 24 h.
- **Global** : 20 échecs par heure ⇒ connexion bloquée 1 h pour tout le monde. C'est une protection contre les attaques distribuées. La session déjà ouverte n'est pas touchée.
- **Réponse uniforme** (`401` ou `429`) avec un délai fixe, sans indiquer si c'est la phrase qui est fausse.
- **En complément, optionnel** : la règle de limitation de débit gratuite de Cloudflare sur `/api/auth/login`.

### 8.3 Protection CSRF

- Cookie en `SameSite=Strict`.
- **Pour toute méthode autre que GET/HEAD** sur `/api/*`, le Worker exige :
  - un en-tête `Origin` égal à l'origine de l'app (en son absence, `Sec-Fetch-Site: same-origin`) ;
  - `Content-Type: application/json`, sauf pour les fichiers ;
  - l'en-tête `X-Discover-Client: 1`. Un formulaire HTML d'un autre site ne peut envoyer aucun de ces éléments.
- **`/atelier/*`** n'accepte que le jeton Bearer et ignore les cookies, donc il n'est pas exposé au CSRF.
- **En-têtes de sécurité** sur chaque réponse :
  - CSP stricte des fichiers statiques (`pwa/public/_headers`) : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' https: http:; img-src 'self' https: http: data:; connect-src 'self'; frame-ancestors 'none'`. `style-src 'unsafe-inline'` est nécessaire à MUI (emotion injecte ses styles) ; aucun script en ligne n'est autorisé. `http:` n'est permis que pour l'audio et les images : certains éditeurs (BBC) redirigent vers des fichiers http, que Chrome convertit lui-même en https dans une page HTTPS ;
  - CSP des réponses de l'API : `default-src 'none'; frame-ancestors 'none'`, avec `Cache-Control: no-store` ;
  - `X-Content-Type-Options: nosniff` ;
  - `Referrer-Policy: no-referrer`.

### 8.4 Validation des URLs (`safeUrl`)

Elle s'applique aux URLs de flux, d'enclosures, de transcriptions et de liens YouTube, côté Worker **et** côté Atelier :
- schéma `https:` pour les appels de publication Atelier en production ; `http:` est accepté pour les flux RSS et leurs enclosures officielles de podcasts (BBC), avec les mêmes contrôles d’hôtes publics et de ports. Un `publisher_stream` doit toujours correspondre exactement à l’enclosure enregistrée ; aucun autre schéma n’est accepté ;
- pas d'identifiants dans l'URL ;
- port par défaut uniquement ;
- refus des IP littérales, de `localhost`, des noms en `.local`, `.internal` ou `.lan`, et des adresses privées ou réservées ;
- redirections suivies **à la main**, 3 au maximum, chacune revalidée ;
- taille plafonnée : 1 Mo pour un flux, 2 Mo pour une transcription, 1 Go pour une enclosure côté Atelier ;
- type vérifié : XML pour un flux, `audio/*` pour une enclosure, SRT/VTT/texte pour une transcription ;
- liens YouTube : domaines `youtube.com` et `youtu.be` seulement, identifiant vidéo extrait et revalidé ;
- **lien Apple** : seul l'identifiant numérique est extrait ; l'appel se fait toujours vers `https://itunes.apple.com/lookup?id=<chiffres>`.

### 8.5 Chemins de fichiers et clés R2

- **Chemins du manifeste** :
  - forme `^(segments|audio)/[a-z0-9][a-z0-9._-]{0,80}\.(json|mp3|m4a)$` ;
  - refusés : `..`, `/` au début, `\`, caractères de contrôle, doublons après normalisation Unicode ;
  - le chemin du `PUT` doit être **exactement** une entrée de `publication_files` de cette publication.
- **Les clés R2 sont toujours construites par le Worker** : `blobs/<sha256>` ou `transcripts/<episode_id>.json`. Elles ne viennent jamais d'une saisie ou de l'Atelier.
- **Lecture** uniquement par identifiants (`/api/contents/:id/variants/:key/audio`). Le Worker résout la clé en D1 et ne sert que des fichiers rattachés à une publication `ready` ou `superseded` depuis moins de 7 jours.
- **Côté Atelier** : les fichiers téléchargés sont écrits uniquement dans `fileToImport/` sous un nom calculé (`<slug>.<type>`). Le nom de fichier fourni par l'éditeur n'est jamais réutilisé.

### 8.6 Données affichées

- **Titres et descriptions des flux** : balises retirées côté Worker, affichés comme du texte.
- **Markdown de My Mind** : rendu sans HTML brut ; liens `https:` uniquement, ouverts dans un nouvel onglet en `rel="noopener noreferrer"`.
- **Journaux** : jamais de contenu de notes, de jeton ni de phrase secrète.

---

## 9. Parcours UX essentiels

### 9.1 Appareil cible : Samsung Galaxy Z Fold7

La PWA tourne dans Chrome Android, sur deux écrans très différents :
- **plié (écran externe)** : un téléphone étroit, environ 410 px CSS de large. Une colonne, navigation en bas ;
- **déplié (écran interne)** : une petite tablette presque carrée, environ 850 à 900 px CSS de large. À partir de **600 px** de large, Explorer, Bibliothèque et My Mind affichent **la liste et le détail côte à côte** (épisode, contenu ou note), à mesure que ces écrans arrivent (lots 2, 4, 10, 11). Le mini-lecteur reste en bas dans les deux cas.

Passer d'un écran à l'autre ne recharge jamais l'app : la mise en page s'adapte à la largeur, sans perdre la lecture en cours, la position dans les listes ou le texte en cours de saisie.

Chrome Android gère bien l'installation, l'audio en arrière-plan et la Media Session (contrôles sur l'écran verrouillé et dans les notifications).

### 9.2 Parcours

1. **Matin** :
   - j'ouvre Explorer : les nouveaux épisodes avec leur durée, leur langue, et les badges « transcription » et « préparé » ;
   - je les lance en streaming officiel ; le mini-lecteur persiste quand je change d'onglet ou que l'écran est verrouillé.
2. **Réfléchir tout de suite** (dès le lot 4) :
   - le bouton « Réfléchir » sur un épisode crée une note liée à cet épisode ;
   - la note est sauvegardée automatiquement, même hors connexion.
3. **Préparer en anglais** :
   - le mode est proposé selon la langue et la durée (§ 7.4), avec une estimation du temps ;
   - l'épisode passe par les statuts « En file », puis « En préparation · étape », puis « Prêt » ou « Échec · réessayer ».
4. **Écouter une version préparée** :
   - un sélecteur de version : Original · Anglais fidèle · Intégral B1 · Condensé B1 · 12 min · L'essentiel ;
   - la transcription, synchronisée quand c'est vérifié ;
   - le français à la demande ;
   - les vitesses de 0,75× à 1,25× ;
   - la reprise au bon endroit pour chaque version.
5. **Ajouter une émission** : nom, lien Apple ou RSS, puis aperçu, catégorie, filtre de titre et « Suivre ».
6. **Retrouver** : Bibliothèque (En cours · Sauvegardés · Préparés · Téléchargés) et recherche.
7. **Sécurité** : Réglages → Appareils connectés → révoquer.
8. **Hors ligne** : télécharger un contenu préparé ; voir l'espace utilisé ; supprimer.

---

## 10. Décisions techniques

| Décision | Choix | Justification |
|---|---|---|
| Produit | App séparée d'EnglishFluency | EnglishFluency est déjà chargée ; code réutilisé par copie. |
| Hébergement | Un seul Worker (API + PWA en static assets) | Même origine : CSRF et cookie simples, un seul déploiement. |
| Offre | Workers Free d'abord | Mesures § 7.1 ; repli documenté vers Workers Paid. |
| Collecte | Une émission par minute, lecture en flux, arrêt au premier GUID connu | Seule approche mesurée sous 10 ms de CPU. |
| Front | React 18, TypeScript strict, Vite, React Router, TanStack Query, MUI | Même stack qu'englishPwa. |
| PWA | vite-plugin-pwa (Workbox) | Standard. |
| Stockage local | IndexedDB via `idb` | Brouillons de notes, téléchargements. |
| Lecteur | Un seul `HTMLAudioElement` à la racine, Media Session | Continuité entre les écrans, contrôles sur l'écran verrouillé. |
| Audio original | Streaming officiel par défaut | Application personnelle, pas de copie inutile ; synchronisation contrôlée (§ 7.3). |
| Fichiers R2 | Adressés par contenu (`blobs/<sha256>`), intégrité vérifiée par R2 | Reprise et réutilisation gratuites, aucun calcul d'empreinte côté Worker. |
| Publication | Pointeur `current_publication_id` avec contrôle de `seq` | Bascule atomique ; une révision plus ancienne ne peut pas en remplacer une récente. |
| File | Bail de 15 min, signal de vie, jeton de bail | Récupération automatique ; pas d'écriture par une instance périmée. |
| Sessions | Jeton aléatoire, empreinte en D1, révocables | Révocation immédiate, compatible avec 10 ms de CPU. |
| Recherche | D1 FTS5 | Gratuit, sans embedding. |
| Validation | JSON Schema et fixtures partagées (TS et Python) | Le Worker et l'Atelier restent d'accord. |
| Notes | Dernière écriture gagnante avec contrôle `baseUpdatedAt` (409) | Un seul utilisateur ; aucune perte silencieuse. |
| Évaluation B1 | Indicateurs et juge, sans seuil strict | Simplicité et fidélité plutôt qu'un compte de mots. |

---

## 11. Plan de développement

Chaque lot produit un résultat **utilisable**, vérifié sur le Galaxy Z Fold7 (Chrome Android), **plié et déplié**, et ses tests automatisés.

| Lot | Contenu | Livrable utilisable |
|---|---|---|
| **0** | v2 de ce document ; mesure de la collecte (fait) ; commit de la suppression « Idées » dans l'Atelier | Contrats figés |
| **1 — Socle sécurisé** ✅ (local) | Dépôt, Worker et static assets, migration 0001, R2, sessions, limitation, CSRF, en-têtes, PWA installable à 3 onglets | Connexion sur le Fold7 ; Réglages → Appareils |
| **2 — Émissions et collecte** ✅ | `resolve`, import de la liste de départ, cron (§ 7.1), filtres, rétention, Explorer | Les vrais épisodes du jour sur le téléphone |
| **3 — Lecteur** ✅ | Mini-lecteur persistant, streaming officiel, vitesses, sauts, Media Session, progression par audio | Écouter ses podcasts dans l'app |
| **3 bis — Passe design** ✅ | Identité visuelle et ergonomie, une fois qu'il y a du vrai contenu (épisodes, lecteur) : cartes d'épisodes, typographie de lecture, mini-lecteur, mise en page pliée et dépliée (Fold7), mouvements discrets | Une app agréable au quotidien, jugée sur de vrais épisodes |
| **4 — My Mind minimal** ✅ | Notes Markdown (création, modification, liste, corbeille), sauvegarde locale, synchronisation 409, « Réfléchir » depuis un épisode, export JSON | Écrire ses réflexions au fil des écoutes |
| **5 — Transcriptions des flux** ✅ | SRT/VTT → segments, cache R2, contrôle de synchronisation par la durée | Lire en écoutant (Bloomberg) |
| **6 — Contrat de publication** ✅ (déployé) | Schémas, fixtures, validateurs TS et Python, protocole § 6.5, nettoyage, routes média, cible « discover » dans l'Atelier (bundles YouTube existants) | Les contenus déjà préparés dans l'Atelier, visibles sur le téléphone |
| **7 — Lecture des versions** ✅ (déployé) | Sélecteur de version (avec sa nature : intégral, condensé, essentiel ; niveau ; durée), transcription, français à la demande, navigation par segment, progression par version | Écouter Original, Fidèle, Intégral B1 ou Condensé B1 |
| **8 — File avec bail** ✅ (déployé) | Bouton et options dans la PWA ; onglet « À préparer » dans l'Atelier ; bail, signal de vie, reprise ; téléchargement et normalisation de l'épisode | Marquer sur le téléphone et importer/transcrire dans l’Atelier ; versions adaptées au lot 9 |
| **9 — Versions préparées** ✅ (déployé) | `adaptation.py` : couverture × niveau × durée (§ 7.4), synthèse en deux passes avec renvois (§ 7.7), évaluation fond puis langue (§ 7.6), exclusion des publicités, narration par défaut, calibrage du débit Kokoro, préparation auto de L'édito éco | Un épisode de 50 min écouté en 12 min à son niveau |
| **9 bis — Temps réel et notifications** ✅ (déployé) | Durable Object et WebSocket avec hibernation ; outbox D1 ; Web Push et Service Worker ; activation par appareil | Suivi instantané et notification prête / à relire / échec, même PWA fermée ; réception Fold7 confirmée ; fermeture et clic à valider |
| **10 — My Mind complet** | Tags, types, questions, liens vers les passages, recherche FTS5, « Préparer en anglais » pour une note | Relire ses idées en anglais |
| **11 — Bibliothèque et hors ligne** | Filtres, téléchargements explicites, espace utilisé, suppression | Écouter en mode avion |
| **12 — Export et pont EnglishFluency** | Export complet (JSON + Markdown) ; case « aussi vers EnglishFluency » | Données récupérables ; les contenus nourrissent EnglishFluency |

---

## 12. Choix de V1 confirmés

- Narration comme style B1 par défaut ; dialogue en option.
- Nom technique `discover`.
- Cloudflare Free en première intention, repli vers Workers Paid documenté (§ 7.1).
- Streaming officiel par défaut ; copie privée de l'original seulement sur demande.
- Seuil de préparation complète de 25 minutes ; préparation automatique pour L'édito éco seulement.
- Gemini pour l'adaptation et les notes My Mind (rien de confidentiel), avec envoi explicite note par note.

---

## 13. Critères d'acceptation V1

### Collecte (lots 2 et 5)
- [ ] Les 36 émissions sont collectées sans intervention ; chacune est vérifiée environ toutes les 36 minutes, et au plus toutes les 45 minutes au plafond de 40 abonnements.
- [ ] Aucune exécution du cron ne dépasse 10 ms de CPU sur 24 h de journaux (`exceededCpu` = 0), ou le repli § 7.1 est appliqué et documenté.
- [ ] Trois passages successifs sans nouvel épisode ne créent aucun doublon et ne lisent aucun épisode au-delà du premier GUID connu.
- [ ] Un flux en erreur (404, XML invalide, délai dépassé, redirection vers une adresse interdite) n'empêche pas la collecte des autres, et son erreur est visible.
- [ ] Les filtres PSG ne gardent que les épisodes dont le titre contient un mot-clé.
- [ ] La rétention garde les épisodes sauvegardés ou préparés au-delà de 30 jours ; les dix dernières histoires restent disponibles quel que soit leur âge.

### Lecture (lots 3, 5 et 7)
- [ ] L'audio officiel se lit en streaming et continue quand on change d'onglet, qu'on verrouille l'écran du Fold7, ou qu'on le plie ou le déplie.
- [ ] Vitesses 0,75 / 0,9 / 1 / 1,1 / 1,25×, sauts ±10 s, contrôles sur l'écran verrouillé.
- [x] La progression est gardée **par audio**, et remise à zéro si l'audio change.
- [x] Le surlignage n'est actif que si `timing_status = exact`, ou si la durée réelle diffère de `durationMs` de 1,5 s au plus.
- [x] Le français n'est affiché que s'il traduit exactement la variante active.

### Publication et variantes (lot 6)
- [x] Un manifeste valide de chacun des types (épisode FR, épisode EN, YouTube, réflexion) est publié et visible.
- [x] Chaque règle du § 6.2 a sa fixture invalide, refusée avec un code d'erreur précis, aussi bien en TS qu'en Python.
- [x] Publier deux fois le même manifeste ne crée ni doublon ni nouvelle révision.
- [x] Un envoi interrompu au milieu d'un fichier est refusé par R2. La relance n'envoie que les fichiers manquants.
- [x] Deux commits simultanés de la même publication : un seul réussit, l'autre reçoit `409`.
- [x] Un commit d'une révision plus ancienne ne remplace pas la révision courante.
- [x] Une nouvelle révision qui omet une variante existante est refusée (`variant_dropped`), sauf si elle figure dans `removeVariants`.
- [x] Un fichier encore référencé, ou référencé par une révision remplacée depuis moins de 7 jours, n'est jamais supprimé.
- [x] Une publication incomplète n'est jamais visible dans la PWA.

**Validation du 2026-10-17** : fixtures TS/Python et protocole complet testés dans le runtime Cloudflare local (podcast FR, podcast EN, YouTube, réflexion). Migration `0003` appliquée localement et en production. Un bundle YouTube réel de 15,8 Mo est publié sur Discover, relancé sans nouvelle révision ; ses 56 segments et son audio R2 (`206`) ont été vérifiés en production. Le jeton Atelier a été renouvelé et enregistré dans `convert/config_discover.json` (ignoré par Git, permissions 0600). Le sélecteur de versions reste au lot 7. Détails techniques : `contracts/README.md`. **La validation sur le Fold7 réel reste à faire.**

### File « à préparer » (lot 8)
- [x] Deux instances qui demandent un bail en même temps n'obtiennent jamais la même demande.
- [x] Atelier fermé en plein travail : la demande redevient disponible après l'expiration du bail (15 min) et est reprise.
- [x] Une instance dont le bail a expiré ne peut ni clore la demande, ni la faire échouer, ni la publier (`409 lease_lost`).
- [x] Après 3 tentatives, la demande passe `failed` avec la dernière erreur, et elle est visible dans la PWA.

### Versions préparées (lot 9)
- [x] Les variantes source, traduction fidèle (si demandée) et préparée sont toutes publiées et sélectionnables, avec leur nature affichée (intégral, condensé, essentiel ; niveau ; durée).
- [x] Un épisode long donne un condensé B1 dont la durée réelle est à ±20 % de la cible (12 min par défaut) : essai réel de 43 min 18 s → 11 min 16 s, cible 12 min ; le scénario de référence reste un épisode d’environ 50 min.
- [x] Chaque paragraphe d'un condensé renvoie à au moins un segment source ; tout nombre ou nom propre absent des segments cités est signalé.
- [x] Les publicités de l'original sont absentes de la version préparée ; une annonce d'entreprise journalistique, elle, est conservée (vérifié sur 2 épisodes).
- [x] Le texte de la version préparée est surligné en rythme sans calage (timestamps Kokoro).
- [x] Une version `review` n'est jamais publiée automatiquement ; une cible trop courte pour le sujet est signalée.
- [ ] Sur 5 épisodes relus : « plus court et plus simple que l'original », « sans contresens », et « les explications principales sont là ».

### Temps réel et notifications (lot 9 bis)
- [x] Les transitions de file sont enregistrées atomiquement avec leur événement ; un simple renouvellement de bail ne crée pas d'événement.
- [x] La PWA ouverte reçoit les changements par WebSocket et relit les données D1 ; reconnexion avec récupération de l'état courant et suivi périodique en repli.
- [x] Une origine étrangère est refusée, une session révoquée ne conserve pas son accès aux événements.
- [x] Les abonnements sont propres à chaque appareil, avec activation explicite, désactivation et test limité.
- [x] Les messages Push sont chiffrés, génériques, dédupliqués par événement/appareil, et les envois temporaires sont repris de façon bornée ; les abonnements expirés sont retirés.
- [x] Un état suivant annule les anciennes notifications encore en attente de la même demande.
- [x] Sur le Fold7 : autoriser les notifications et recevoir le test (réception confirmée par l’utilisateur le 2026-10-18).
- [ ] Sur le Fold7 : vérifier la réception PWA fermée, puis ouvrir Discover depuis la notification.

### My Mind (lots 4 et 10)
- [ ] Une note se crée sans source.
- [ ] Une note peut être liée à plusieurs épisodes ou contenus.
- [ ] Fermer l'app en pleine frappe ne perd rien (brouillon IndexedDB restauré).
- [ ] Une modification concurrente provoque un `409` et propose de garder l'une ou l'autre version : rien n'est écrasé sans être vu.
- [ ] Supprimer un contenu laisse ses notes liées intactes et lisibles.
- [ ] L'export JSON contient toutes les notes, avec leurs liens.

### Sécurité (lot 1, puis vérifiée à chaque lot)
- [ ] Sans session valide, toutes les routes `/api/*` répondent `401`, sauf la connexion.
- [ ] `/atelier/*` ne répond `200` qu'avec le bon jeton Bearer, et ignore les cookies.
- [ ] Une session révoquée est refusée à la requête suivante. Changer `SESSION_EPOCH` déconnecte tout le monde.
- [ ] 6 échecs de connexion depuis une même IP en 15 min donnent un `429`.
- [ ] Une requête qui modifie quelque chose sans le bon `Origin` ou sans `X-Discover-Client` est refusée (`403`).
- [ ] Les tests `safeUrl` refusent `http://127.0.0.1`, `https://10.0.0.1`, `file://`, `https://user:pass@…`, une redirection vers une IP privée et un port non standard.
- [ ] Les tests de chemins refusent `../x`, `/x`, `audio\x.mp3`, un chemin absent de la publication et un caractère de contrôle.
- [ ] Aucun fichier R2 n'est accessible sans session, ni par une clé fournie par le client.

### Infrastructure
- [ ] PWA installable sur le Fold7 (Chrome Android), avec une icône adaptative (maskable).
- [ ] Plier ou déplier le Fold7 ne recharge pas l'app : ni la lecture ni une saisie en cours ne sont perdues.
- [ ] Mise en page correcte sur l'écran externe (une colonne) et sur l'écran interne (§ 9.1).
- [ ] L'app fonctionne entièrement sans LLM, sauf pour la préparation dans l'Atelier.
- [ ] Les contenus téléchargés se lisent en mode avion.
- [ ] Le Worker reste dans les quotas de l'offre gratuite sur une semaine d'usage réel.

---

## 14. Matrice de cohérence

| Objet | Tables D1 | Routes | Manifeste / segments | Lot |
|---|---|---|---|---|
| Session | `sessions`, `login_attempts` | `/api/auth/*` | — | 1 |
| Émission | `shows` | `/api/shows*` | — | 2 |
| Épisode | `episodes` | `/api/explorer`, `/api/episodes/*` | `content.sourceRef = episode:<id>` ; `audio.url` = `episodes.audio_url` | 2, 5 |
| Transcription du flux | `episodes.transcript_*` | `/api/episodes/:id/transcript` | `timingSource: rss_srt\|rss_vtt` | 5 |
| Contenu | `contents` | `/api/library`, `/api/contents/:id` | `content.*` (sauf `rights`, gardé dans le manifeste R2) | 6 |
| Révision | `publications`, `publication_files` | `/atelier/publications*` | `files{}`, `revision` calculée, `removeVariants` | 6 |
| Variante | `variants` (clé `publication_id`, `variant_key`) | `/api/contents/:id/variants/:key/*` | `variants[]` : `key`, `kind`, `language`, `cefrLevel`, `style`, `coverage`, `condensation`, `derivedFrom`, `segmentsFile`, `audio{source,file\|url,origin,durationMs,timingSource}`, `generation`, `evaluation` | 6, 7, 9 |
| Segments | (R2) | `…/segments` | `segments.schema.json` : `id`, `speaker`, `text`, `fr`, `startMs`, `endMs`, `sourceSegments`, `keyVocab` | 5, 6, 7 |
| Demande | `prepare_queue` | `/api/episodes/:id/prepare`, `/api/reflections/:id/prepare`, `/api/queue*`, `/atelier/queue/*` | `queueItemId` et `leaseToken` à la déclaration | 8 |
| Progression | `listening_progress` | `/api/progress` | `audio_ref` = `audio_sha256` ou `audio.url` | 3, 7 |
| Réflexion | `reflections`, `reflection_links` | `/api/reflections*` | `content.sourceType = reflection`, `sourceRef = reflection:<id>` ; commit → `english_content_id` | 4, 10 |
| Recherche | `search_index` | `/api/search` | — | 10 |
| Export | toutes, sauf sécurité | `/api/export` | — | 4 (notes), 12 (complet) |

Correspondances vérifiées :
- Chaque statut cité dans les routes existe dans une contrainte `CHECK`.
- Chaque champ obligatoire du manifeste a sa colonne, ou est volontairement gardé seulement dans le manifeste R2 (`rights`).
- Chaque route est rattachée à un lot.
- Les critères du § 13 couvrent les lots 1 à 12.

---

## 15. Hors V1

- Deepgram dans le Worker, pour transcrire automatiquement les épisodes anglais sans le Mac.
- Regroupement des récits en plusieurs parties.
- Collections ; historique des versions des notes.
- IA dans My Mind (questions, contre-arguments, à la demande, avec quota).
- Retour des titres d'articles RSS.
- « Partager vers Discover » depuis l'app Podcasts ou YouTube du Fold7 (Web Share Target, pris en charge par Chrome Android) pour mettre un lien dans la file « à préparer ».
- Envoi de gros fichiers en plusieurs morceaux (multipart), inutile tant que les audios sont normalisés sous 95 Mo.

---

## 16. Liste de départ

`docs/seed-shows.json` : **36 émissions** (28 initiales et 8 podcasts de récits ajoutés à ta demande), vérifiées le 2026-10-17. Power On with Mark Gurman a été retiré après relecture.

| Catégorie | Émissions |
|---|---|
| Tech | Bloomberg Tech (SRT), Better Offline (SRT), Tech&Co, Tech Café |
| Sciences | BBC Inside Science, BBC Discovery, The Rest Is Science |
| Économie | Bloomberg Intelligence, Daybreak Europe, Daybreak US, Surveillance, Money Stuff (tous en SRT), FT News Briefing, L'édito éco (**auto**), Les voix de l'économie |
| Actualité | BBC Global News, The Daily, Today in Focus, L'ordre du monde, Journal de 8h (Radio Classique), Code source |
| Football | The Athletic FC, BBC Football Daily, L'After Foot / On refait le match / RFI (**filtre PSG**) |
| Histoires | Paranormal, T'as qui en Histoire ? (VTT), Sherlock Holmes Short Stories, The Classic Tales Podcast, BBC Learning English Stories, BBC Radio 4 – Short Story, The Truth, LeVar Burton Reads, Selected Shorts, Nouvelles Histoires Extraordinaires |

Limite d'abonnements : **40** (relevée le 2026-10-17 pour les huit podcasts de récits), soit un cycle d’environ 36 minutes avec les 36 émissions actuelles, jusqu’à 40 minutes au plafond sur l’offre gratuite. Les archives de la catégorie Histoires restent disponibles, dans la limite des dix derniers épisodes par émission.

---

## 17. Points à vérifier en début de lot

1. **Avant le lot 2** : l'offre réelle du compte Cloudflare. **Constat du lot 1** : `techpulse-worker` déclare 4 crons et `englishfluency-worker` 1, soit 5, ce qui est exactement la limite de l'offre gratuite (5 par compte). Si le compte est en offre gratuite, il faut libérer un cron de TechPulse (projet remplacé par discover) avant de déployer la collecte.
2. **Début du lot 3** : relire 24 h de journaux du cron. **Mesures du 2026-10-17** en production : le cron ne s'est activé que 6 à 10 minutes après le déploiement ; les premières collectes (10 épisodes, insertion D1 comprise) coûtent **8 à 11 ms** de CPU, sans interruption (`outcome: ok`). Les passages suivants s'arrêtent au premier GUID connu et devraient coûter moins. Si des `exceededCpu` apparaissent, limiter la première collecte d'une émission à 5 épisodes.
3. **Lot 5** : l'écart de durée entre le fichier officiel et celui transcrit par l'Atelier, sur 3 épisodes avec publicités dynamiques. On ajustera le seuil de 1,5 s si besoin.
4. **Lot 9** : cinq épisodes réels ont servi au contrôle des couvertures, des renvois, des publicités et de la simplicité. Les seuils restent indicatifs : noms traduits et nombres reformulés peuvent demander une relecture. Voir `docs/LOT9_PREPARATION.md`.

### Compléments du lot 6 (2026-10-17)

- Suppression « Idées » isolée dans le commit Atelier `9191390`, sans embarquer le travail vocabulaire.
- Contrat : segments JSON limités à 5 Mo pour borner la mémoire du Worker ; audios transmis en streaming avec vérification SHA-256 par R2.
- Nettoyage : réservation des blobs en D1 pour éviter une réutilisation concurrente pendant leur suppression ; au plus 10 blobs et 10 manifestes par passage, à la minute 17.
- Un verrou de commit interrompu depuis 15 min est récupéré au prochain nettoyage, avec un jeton qui interdit une ancienne bascule tardive.
- Première mesure de publication en production : envoi audio de 15,7 Mo à **7 ms de CPU**, `outcome: ok`. Cela ne remplace pas une mesure complète des quotas et du cron sur 24 h. Les déploiements de Discover datent de ce jour : la fenêtre complète de 24 h n’est pas encore disponible.
- Livraison lot 6 : **138 tests Worker + 126 tests Atelier + 9 tests PWA**, types et build validés. Commit Atelier : `8dfbd86`. Version Worker : `6bac5190-0d40-4bc0-98fa-d274e0063295`.

### Compléments du lot 7 (2026-10-17)

- La page d’un contenu propose les seules variantes publiées, avec nature (Original, Fidèle, Intégral, Condensé, L’essentiel), niveau, langue et durée audio réelle. Les variantes sans audio portent « Texte seul ».
- La version choisie est conservée dans `?v=<variant_key>`. Pendant une écoute, le changement suit la nouvelle version et sa progression ; en pause, il reste en pause. Choisir un texte seul ferme l’audio précédent.
- Le français est masqué initialement et à chaque changement de version. Il vient de `fr` dans les segments actifs ou d’une paire source / traduction fidèle française, appariée par identifiants. Le français de la source n’est jamais réutilisé pour une adaptation. La génération de nouvelles traductions reste dans l’Atelier.
- Les passages avec timings fiables sont cliquables ; le surlignage et le suivi nécessitent `exact` ou une durée réelle à ±1,5 s. Sans timings, le texte et l’audio restent disponibles séparément. Aucun passage n’est surligné dans une pause entre segments ou après leur fin.
- La progression distingue les versions et les références audio. Une reprise asynchrone périmée ne peut pas déplacer la version suivante ; un passage choisi prend priorité sur la reprise stockée. Le simple préchargement en pause ne remet pas à zéro une version terminée.
- Le détail d’un épisode préparé mène à ses versions. Le lecteur complet permet de revenir à la transcription active depuis les autres onglets.
- Validation : **27 tests PWA et 139 tests Worker**, types et build. Parcours navigateur sur cinq variantes de contrôle uniquement locales (audios silencieux) : français à la demande, B1 et condensé indépendants, sauts, texte seul et version terminée. Mise en page et lecture conservées entre 410 et 880 px. **Le Fold7 physique, écran verrouillé, reste à vérifier manuellement.**
- Atelier Mac : la cible de publication a été ajoutée au lot 6 ; la file et sa reprise arrivent au lot 8 ; Gemini, adaptation et Kokoro au lot 9 ; le double envoi Discover / EnglishFluency au lot 12. Le lot 7 ne fabrique pas de versions absentes.
- Déploiement lot 7 : version Worker `4adc5db5-2193-4654-a03f-ca5d288994c7`. Contrôle de production sur le bundle réel publié au lot 6 : sélecteur actif, transcription et **56 traductions françaises** à la demande. Aucun contenu de contrôle B1/condensé n’a été envoyé en production.

- Ajout des huit podcasts de récits (2026-10-17) : migration `0004_story_shows.sql` appliquée en production ; **36 abonnements confirmés**, dont sept nouveaux en anglais et un en français, sans retrait des 28 précédents. Limite portée à 40 ; archives Histoires conservées parmi les dix derniers épisodes. Flux vérifiés par l’aperçu RSS de production ; 140 tests Worker, TypeScript Worker/PWA et build PWA réussis. Worker déployé : `11780e78-2faa-45a4-bd13-a4b3b3fd3589`. Première collecte des nouveaux abonnements confiée au cron.

- Lot 8 (2026-10-17) : file et suivi PWA déployés, onglet « À préparer » installé dans l’Atelier Mac. Validation : **149 tests Worker, 29 tests PWA, 137 tests Atelier**, TypeScript et build réussis. Test réel en environnement isolé sur BBC Learning English Stories : audio normalisé mono 24 kHz / 64 kbit/s, 17 segments MacWhisper, bail rendu en `source_ready`. Repli vérifié avec le modèle Base (sans détection des intervenants). Versions adaptées au lot 9 ; contrôle physique Fold7 restant à faire. Worker `1a4c5643-5403-4a40-8651-a245deea610c` ; Atelier commit `3a1a511`. Voir `docs/LOT8_QUEUE.md`.

### Compléments du lot 9 (2026-10-17)

- Préparation Gemini avec extraction de tous les blocs, citations contraintes, traduction française, contrôle indépendant de fidélité, relecture et correction explicites. Traduction fidèle française→anglais facultative. Kokoro local calibré, timings exacts et contrôle de durée réelle. Voir `docs/LOT9_PREPARATION.md`.
- Préparation automatique limitée aux émissions configurées ; seule `edito-eco` est active en production. Les sources en attente du lot 8 sont reprises. Le Mac doit exécuter la nouvelle version de l’Atelier.
- Enclosures de podcasts HTTP (BBC) acceptées par les deux validateurs, comme par le lecteur ; correspondance obligatoire avec l’enclosure enregistrée et refus des hôtes internes/IP littérales inchangés.
- **156 tests Worker, 29 tests PWA, 158 tests Atelier**, types et build réussis. Cinq épisodes réels traités avec Gemini ; intégral B1 BBC 322 mots, intégral Storiavoce 2 301 mots avec traduction fidèle, condensés narration/dialogue 1 484 / 1 307 mots, essentiel 496 mots. Les alertes locales restent soumises à relecture.
- Parcours navigateur isolé : attente de relecture, validation, synthèse réelle, publication atomique, Original / Intégral B1 sélectionnables, français à la demande et saut dans l’audio à 0:43. Le BBC préparé dure 2 min 39 s ; aucun contenu de test n’a été envoyé en production. Le Fold7 physique reste à vérifier.
- Worker déployé : `8da90262-86f7-46fa-9c88-bf410d75009e` ; Atelier : `f01ed67`, `7cbcfbf` et `a2c7503`. Lecture de production : nouveau bundle PWA servi, Bearer Atelier valide, seule émission automatique `edito-eco`.

- Durée réelle du condensé : premier audio 14 min 52 s, correction automatique du débit de 0,700 à 0,868, puis **11 min 16 s** pour la cible 12 min (±20 % respectés). Treize paragraphes et leurs timings exacts validés contre les sources.
- La relecture technique et les contrôles sur cinq épisodes ne remplacent pas l’appréciation éditoriale de l’utilisateur : le dernier critère qualitatif de § 13 reste à confirmer. Un intégral raccourci de plus de 15 % hors promotions exige une relecture, même si Gemini accepte les faits.

### Compléments du lot 9 bis (2026-10-18)

- Migration `0005_events_push.sql` appliquée localement et en production, Durable Object SQLite `PreparationEvents` avec hibernation, aucun nouveau cron. Les appels HTTP de l’Atelier restent compatibles.
- Notifications Web Push avec VAPID configuré dans les secrets du Worker. Réglages : activation/désactivation sur cet appareil et notification de test. Aucun titre, extrait ou jeton dans les messages.
- Vérification locale réelle : demande créée dans la PWA, passage Atelier à `tts` puis `review`, les deux états reçus sans rechargement. En production : réglages « Suivi en direct », bouton d’activation présent, configuration Push active et origine étrangère refusée (`403 csrf_origin`). Aucun abonnement ou épisode de contrôle créé en production.
- Validation : **171 tests Worker et 37 tests PWA**, types, build et déploiement à blanc réussis. Worker final : `37baa3d8-a1ab-4f7d-b6ee-f5300588c049`. Réception sur le Fold7 confirmée par l’utilisateur le 2026-10-18 ; réception PWA fermée et clic restent à vérifier. Voir `docs/LOT9BIS_REALTIME_PUSH.md`.

- Correctif Push (2026-10-18) : option `redirect:error` incompatible avec workerd remplacée par une Request native en mode `manual`, sans suivre les redirections. Test de régression et contrôle de fin de livraison ajoutés ; **172 tests Worker**. Deux essais utilisateur relancés, acceptés par Google avec **HTTP 201** en une tentative. Réception sur le Fold7 confirmée par l’utilisateur. Worker : `af9ea94e-8a30-49b0-bcc9-e712ba41be52`.
