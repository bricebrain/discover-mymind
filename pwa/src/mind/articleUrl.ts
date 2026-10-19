/** Lien d'article acceptable (vide = pas de lien). */
export const validArticleUrl = (raw: string) => {
  if (!raw.trim()) return true;
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};
