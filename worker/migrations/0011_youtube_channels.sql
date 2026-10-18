-- Les chaînes YouTube partagent les abonnements et la collecte des podcasts.
ALTER TABLE shows ADD COLUMN source_type TEXT NOT NULL DEFAULT 'podcast' CHECK (source_type IN ('podcast','youtube'));
ALTER TABLE shows ADD COLUMN channel_id TEXT;
CREATE UNIQUE INDEX shows_youtube_channel ON shows(channel_id) WHERE channel_id IS NOT NULL;
ALTER TABLE episodes ADD COLUMN video_id TEXT;
CREATE INDEX episodes_youtube_video ON episodes(video_id) WHERE video_id IS NOT NULL;
