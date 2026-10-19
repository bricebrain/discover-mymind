-- Aucun vecteur : liens et groupes calculés dans l’Atelier uniquement.
CREATE TABLE related_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(type,id));
CREATE TABLE related_links (source_type TEXT NOT NULL, source_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, score REAL NOT NULL CHECK(score BETWEEN -1 AND 1), PRIMARY KEY(source_type,source_id,target_type,target_id));
CREATE INDEX related_target ON related_links(target_type,target_id);
CREATE TABLE related_groups (id TEXT PRIMARY KEY, title TEXT NOT NULL, dossier_candidate INTEGER NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE related_members (group_id TEXT NOT NULL REFERENCES related_groups(id) ON DELETE CASCADE, type TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(group_id,type,id));
CREATE INDEX related_member ON related_members(type,id);
CREATE VIEW related_live AS
 SELECT 'article' AS type,a.id,a.title,substr(coalesce(a.content_text,a.summary,''),1,900) AS excerpt,s.language,a.published_at AS publishedAt,a.created_at AS updatedAt,s.publisher AS publisher,'/?a='||a.id AS href,'article' AS sourceKind FROM articles a JOIN article_sources s ON s.id=a.source_id
 UNION ALL SELECT 'episode',e.id,e.title,substr(coalesce(e.description,''),1,900),s.language,e.published_at,e.created_at,s.title,'/?e='||e.id,CASE WHEN e.video_id IS NULL THEN 'podcast' ELSE 'youtube' END FROM episodes e JOIN shows s ON s.id=e.show_id
 UNION ALL SELECT 'reflection',id,coalesce(title,'Note My Mind'),substr(body_md,1,900),'und',created_at,updated_at,coalesce(source_name,'My Mind'),'/mind?n='||id,'note' FROM reflections WHERE deleted_at IS NULL;
INSERT INTO related_changes(type,id) SELECT 'article',id FROM articles;
CREATE TRIGGER related_articles_insert AFTER INSERT ON articles BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('article',NEW.id);
END;
CREATE TRIGGER related_articles_update AFTER UPDATE ON articles BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('article',NEW.id);
END;
CREATE TRIGGER related_articles_delete AFTER DELETE ON articles BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('article',OLD.id);
DELETE FROM related_links WHERE ((source_type='article' AND source_id=OLD.id) OR (target_type='article' AND target_id=OLD.id));
DELETE FROM related_members WHERE type='article' AND id=OLD.id;
END;
INSERT INTO related_changes(type,id) SELECT 'episode',id FROM episodes;
CREATE TRIGGER related_episodes_insert AFTER INSERT ON episodes BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('episode',NEW.id);
END;
CREATE TRIGGER related_episodes_update AFTER UPDATE ON episodes BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('episode',NEW.id);
END;
CREATE TRIGGER related_episodes_delete AFTER DELETE ON episodes BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('episode',OLD.id);
DELETE FROM related_links WHERE ((source_type='episode' AND source_id=OLD.id) OR (target_type='episode' AND target_id=OLD.id));
DELETE FROM related_members WHERE type='episode' AND id=OLD.id;
END;
INSERT INTO related_changes(type,id) SELECT 'reflection',id FROM reflections;
CREATE TRIGGER related_reflections_insert AFTER INSERT ON reflections BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('reflection',NEW.id);
END;
CREATE TRIGGER related_reflections_update AFTER UPDATE ON reflections BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('reflection',NEW.id);
DELETE FROM related_links WHERE ((source_type='reflection' AND source_id=NEW.id) OR (target_type='reflection' AND target_id=NEW.id)) AND NEW.deleted_at IS NOT NULL;
DELETE FROM related_members WHERE type='reflection' AND id=NEW.id AND NEW.deleted_at IS NOT NULL;
END;
CREATE TRIGGER related_reflections_delete AFTER DELETE ON reflections BEGIN
 INSERT OR REPLACE INTO related_changes(type,id) VALUES ('reflection',OLD.id);
DELETE FROM related_links WHERE ((source_type='reflection' AND source_id=OLD.id) OR (target_type='reflection' AND target_id=OLD.id));
DELETE FROM related_members WHERE type='reflection' AND id=OLD.id;
END;
CREATE TRIGGER related_shows_update AFTER UPDATE ON shows BEGIN INSERT OR REPLACE INTO related_changes(type,id) SELECT 'episode',id FROM episodes WHERE show_id=NEW.id; END;
CREATE TRIGGER related_article_sources_update AFTER UPDATE ON article_sources BEGIN INSERT OR REPLACE INTO related_changes(type,id) SELECT 'article',id FROM articles WHERE source_id=NEW.id; END;
