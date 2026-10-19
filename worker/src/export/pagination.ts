export interface Page { index: number; size: number }

/** Les contenus et dossiers, plus lourds, sont lus un par un. */
export function pageSql(page?: Page, size = page?.size): string {
  return page && size ? `LIMIT ${size} OFFSET ${page.index * size}` : '';
}
