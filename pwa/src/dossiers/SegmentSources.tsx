import { Chip, Stack } from '@mui/material';
import { Link } from 'react-router-dom';
import { useContentSegments, type ContentDetail, type ContentSegment, type DossierSource } from '../api/contents';
import { formatClock } from '../player/MiniPlayer';

export interface SourcePassage { source: DossierSource; index: number; startMs: number | null }

export const sourceLink = (s: DossierSource) => (s.type === 'article' ? `/?a=${s.ref}` : s.type === 'episode' ? `/?e=${s.ref}` : s.type === 'reflection' ? `/mind?n=${s.ref}` : `/library/${s.ref}`);

/** Pour un dossier : passage source → (source, instant dans l'original), à partir de la variante source publiée. */
export function useDossierPassages(detail: ContentDetail) {
  const sources = detail.content.sources;
  const sourceVariant = sources?.length ? detail.variants.find((v) => v.kind === 'source') : undefined;
  const doc = useContentSegments(detail.publicationId, sourceVariant, !!sourceVariant);
  const map = new Map<string, SourcePassage>();
  for (const s of doc.data?.segments ?? []) {
    const index = sources?.findIndex((x) => x.id === s.provenance?.sourceId) ?? -1;
    if (s.provenance && index >= 0) map.set(s.id, { source: sources![index]!, index, startMs: s.provenance.startMs });
  }
  return sources?.length ? map : null;
}

/** Sources citées par un paragraphe : une pastille par source, avec le premier instant connu dans l'original. */
/** Une entrée par source citée, dans l'ordre du dossier, avec le premier instant connu ; aucun instant inventé. */
export function sourcesForSegment(segment: Pick<ContentSegment, 'sourceSegments'>, passages: Map<string, SourcePassage>): SourcePassage[] {
  const bySource = new Map<number, SourcePassage>();
  for (const ref of segment.sourceSegments ?? []) {
    const p = passages.get(ref);
    if (!p) continue;
    const known = bySource.get(p.index);
    if (!known || (p.startMs !== null && (known.startMs === null || p.startMs < known.startMs))) bySource.set(p.index, p);
  }
  return [...bySource.values()].sort((a, b) => a.index - b.index);
}

export function SegmentSources({ segment, passages }: { segment: ContentSegment; passages: Map<string, SourcePassage> }) {
  const cited = sourcesForSegment(segment, passages);
  if (!cited.length) return null;
  return <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }} aria-label="Sources de ce passage">
    {cited.map((p) => (
      <Chip key={p.source.id} size="small" variant="outlined" clickable component={Link} to={sourceLink(p.source)}
        title={p.source.title}
        label={`${p.index + 1}. ${p.source.title.length > 32 ? `${p.source.title.slice(0, 31)}…` : p.source.title}${p.startMs !== null ? ` · ${formatClock(p.startMs / 1000)}` : ''}`} />
    ))}
  </Stack>;
}
