-- Flux officiels : https://www.maxifoot.fr/football-webmaster-rss.html
-- Le serveur rss.maxifoot.com ne dispose pas d'un certificat HTTPS valide.
INSERT INTO article_sources (id,title,publisher,feed_url,language,next_check_at,created_at) VALUES
  ('maxifoot-general','Maxifoot · Toute l’actualité','Maxifoot','http://rss.maxifoot.com/football-general.xml','fr',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('maxifoot-top-articles','Maxifoot · Top Articles','Maxifoot','http://rss.maxifoot.com/football-top-articles.xml','fr',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
