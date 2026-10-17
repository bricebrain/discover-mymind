-- Liste demandée le 2026-10-18 : huit retraits et six ajouts.
-- Retrait sans effacement : conserver tout l’historique des émissions désactivées.
UPDATE shows SET enabled=0 WHERE id IN ('after-foot', 'on-refait-le-match',
  'radio-foot-internationale', 'paranormal-histoires-vraies', 'selected-shorts',
  'sherlock-holmes-short-stories', 'the-classic-tales-podcast', 'the-truth');

-- Flux officiels vérifiés : Apple Podcasts et RSS des éditeurs.
INSERT OR IGNORE INTO shows
  (id,title,publisher,apple_id,feed_url,language,category,image_url,auto_prepare,enabled,next_check_at,created_at)
VALUES
('the-moth','The Moth','The Moth',275699983,'https://feeds.feedburner.com/themothpodcast','en','humour','https://images.castfire.com/image/661/0/0/0/0-8486082.jpg',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('the-mortified-podcast','The Mortified Podcast','Mortified Media and Radiotopia',964902342,'https://feeds.feedburner.com/MortifiedPod','en','humour','https://f.prxu.org/mortified/images/d2a89673-b764-4993-a3e6-d7b8c94e4bcd/Mortified.png',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('no-such-thing-as-a-fish','No Such Thing As A Fish','No Such Thing As A Fish',840986946,'https://audioboom.com/channels/2399216.rss','en','humour','https://audioboom.com/i/41239450.png',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('youre-dead-to-me','You''re Dead to Me','BBC Radio 4',1479973402,'https://podcasts.files.bbci.co.uk/p07mdbhg.rss','en','humour','https://ichef.bbci.co.uk/images/ic/3000x3000/p0nr577g.jpg',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('droles-dhistoires','Drôles d''histoires','Ouest-France',1477036030,'https://api.octopus.saooti.com/rss/emission/67.rss','fr','humour','https://prod-s3-main.s3.eu-west-par.io.cloud.ovh.net/42d17e51-795f-447d-9f78-449648f93423/emission/67/ff671c20-5176-4b1f-9e32-d2c61336a366.jpg',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('les-pieds-sur-terre','Les Pieds sur terre','France Culture',160879442,'https://radiofrance-podcast.net/podcast09/rss_10078.xml','fr','humour','https://www.radiofrance.fr/s3/cruiser-production/2022/06/a7fc766f-3e49-45a0-a41f-5512d5c0f8c1/1400x1400_les-pieds-sur-terre.jpg?1792274584040',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
