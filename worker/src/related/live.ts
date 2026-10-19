/**
 * Jointures directes vers l'élément vivant (article, épisode ou note hors corbeille) d'une référence (type, id).
 * La vue `related_live` réunit trois tables : jointe telle quelle, SQLite la matérialise en entier à chaque requête,
 * ce qui dépasserait vite les 10 ms du Worker. Ici, chaque table est jointe par sa clé primaire.
 */
export function live(type: string, id: string, p: string) {
  const a = `${p}_art`, as = `${p}_src`, e = `${p}_ep`, s = `${p}_show`, r = `${p}_note`;
  const pick = (article: string, episode: string, note: string) =>
    `CASE ${type} WHEN 'article' THEN ${article} WHEN 'episode' THEN ${episode} WHEN 'reflection' THEN ${note} END`;
  return {
    joins: `LEFT JOIN articles ${a} ON ${type}='article' AND ${a}.id=${id}
      LEFT JOIN article_sources ${as} ON ${as}.id=${a}.source_id
      LEFT JOIN episodes ${e} ON ${type}='episode' AND ${e}.id=${id}
      LEFT JOIN shows ${s} ON ${s}.id=${e}.show_id
      LEFT JOIN reflections ${r} ON ${type}='reflection' AND ${r}.id=${id} AND ${r}.deleted_at IS NULL`,
    exists: `(${a}.id IS NOT NULL OR ${e}.id IS NOT NULL OR ${r}.id IS NOT NULL)`,
    title: pick(`${a}.title`, `${e}.title`, `coalesce(${r}.title,'Note My Mind')`),
    excerpt: pick(`substr(coalesce(${a}.content_text,${a}.summary,''),1,900)`, `substr(coalesce(${e}.description,''),1,900)`, `substr(${r}.body_md,1,900)`),
    language: pick(`${as}.language`, `${s}.language`, `'und'`),
    publishedAt: pick(`${a}.published_at`, `${e}.published_at`, `${r}.created_at`),
    publisher: pick(`${as}.publisher`, `${s}.title`, `coalesce(${r}.source_name,'My Mind')`),
    href: pick(`'/?a='||${a}.id`, `'/?e='||${e}.id`, `'/mind?n='||${r}.id`),
    sourceKind: pick(`'article'`, `CASE WHEN ${e}.video_id IS NULL THEN 'podcast' ELSE 'youtube' END`, `'note'`),
  };
}
