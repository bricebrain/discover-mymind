-- Étend les contraintes audio ; copie intégrale des variantes existantes avant bascule.
CREATE TABLE variants_deepgram (
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
  audio_origin     TEXT CHECK (audio_origin IN ('original','kokoro','deepgram')),
  duration_ms      INTEGER,
  timing_source    TEXT NOT NULL CHECK (timing_source IN ('rss_srt','rss_vtt','macwhisper_srt','kokoro','deepgram','none')),
  timing_status    TEXT NOT NULL DEFAULT 'exact' CHECK (timing_status IN ('exact','unverified','none')),
  excerpt_start_ms INTEGER, excerpt_end_ms INTEGER,
  part_index       INTEGER, part_total INTEGER,
  evaluation_json  TEXT NOT NULL DEFAULT '{}',    -- indicateurs § 7.6 (adaptations)
  generation_json  TEXT NOT NULL DEFAULT '{}',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  coverage TEXT NOT NULL DEFAULT 'full' CHECK (coverage IN ('full','condensed','essentials')),
  condensation_json TEXT,
  PRIMARY KEY (publication_id, variant_key)
);

INSERT INTO variants_deepgram SELECT * FROM variants;
DROP TABLE variants;
ALTER TABLE variants_deepgram RENAME TO variants;
