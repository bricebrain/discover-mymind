import { Link } from 'react-router-dom';
import type { DossierSource } from '../api/contents';
import { SOURCE_TYPES } from './DossiersPanel';
import { sourceLink } from './SegmentSources';

/** En tête d'une synthèse de dossier : les sources réellement traitées, dans l'ordre, avec un lien vers chacune. */
export function DossierSourcesList({ sources }: { sources: DossierSource[] }) {
  return <div className="mt-3 rounded-2xl bg-muted p-3.5 font-sans">
    <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Synthèse de {sources.length} sources</p>
    <ol className="m-0 flex flex-col gap-1 pl-5 text-sm">
      {sources.map((s) => <li key={s.id}>
        <Link to={sourceLink(s)} className="text-primary no-underline hover:underline">{s.title}</Link>
        <span className="text-xs text-muted-foreground"> · {SOURCE_TYPES[s.type]}</span>
      </li>)}
    </ol>
  </div>;
}
