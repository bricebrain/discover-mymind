-- Migration 0001 : schéma initial de discover (docs/PHASE0_ARCHITECTURE.md § 4).
-- Dates en ISO 8601 UTC fournies par le Worker (toISOString), comparées comme des chaînes.

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
  id               TEXT PRIMARY KEY,              -- base32(sha256(show_id|guid))[0..20]
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
  excerpt_start_ms INTEGER, excerpt_end_ms INTEGER,
  part_index       INTEGER, part_total INTEGER,
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
