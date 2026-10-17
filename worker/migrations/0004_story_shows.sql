-- Huit podcasts de récits demandés le 2026-10-17 ; flux vérifiés via Apple et le lecteur RSS.
INSERT OR IGNORE INTO shows
  (id, title, publisher, apple_id, feed_url, language, category, auto_prepare, enabled, next_check_at, created_at)
VALUES
('sherlock-holmes-short-stories', 'Sherlock Holmes Short Stories', 'NOISER', 1784284807, 'https://feeds.megaphone.fm/NSR5430340583', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('learning-english-stories', 'Learning English Stories', 'BBC Radio', 925326414, 'https://podcasts.files.bbci.co.uk/p02pc9s1.rss', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('short-story', 'Short Story', 'BBC Radio 4', 1281767970, 'https://podcasts.files.bbci.co.uk/p05ftsd3.rss', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('levar-burton-reads', 'LeVar Burton Reads', 'LeVar Burton and Stitcher', 1244649384, 'https://feeds.simplecast.com/LDNgBXht', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('nouvelles-histoires-extraordinaires', 'Nouvelles Histoires Extraordinaires', 'Quentin Casier', 1568895852, 'https://feeds.acast.com/public/shows/60a552ac36c18d001219e489', 'fr', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('the-classic-tales-podcast', 'The Classic Tales Podcast', 'B.J. Harrison', 258214995, 'https://feeds.libsyn.com/30031/rss', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('the-truth', 'The Truth', 'The Truth', 502304410, 'https://feeds.megaphone.fm/SBP9327453320', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
('selected-shorts', 'Selected Shorts', 'Symphony Space', 253191824, 'https://rss.introcast.io/253191824/feeds.simplecast.com/ZoGIhfvz', 'en', 'stories', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
