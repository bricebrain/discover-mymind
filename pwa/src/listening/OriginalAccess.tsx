import { BookOpen, ExternalLink, Headphones, MoreVertical, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, Spinner } from '@/components/ui/kit';
import type { ContentDetail, ContentSegment, ContentVariant } from '../api/contents';
import { sourceLink, sourcesForSegment, useDossierPassages } from '../dossiers/SegmentSources';
import { useOriginalPassage, type Original } from './useOriginal';

export interface OriginalMenuState { segment: ContentSegment; anchor: HTMLElement }

/**
 * I3 — accès à l'original depuis un paragraphe de version adaptée.
 * Le bouton (et l'appui long sur le paragraphe) ouvrent un volet : écouter l'original au premier passage cité si son
 * horodatage est fiable, sinon lire le texte de ces passages, et pour un dossier multisources, ouvrir les sources d'origine.
 */
export function OriginalButton({ segment, onOpen }: { segment: ContentSegment; onOpen: (state: OriginalMenuState) => void }) {
  if (!segment.sourceSegments?.length) return null;
  return <Button variant="ghost" size="icon-sm" className="mt-1 text-muted-foreground" title="Original de ce passage"
    aria-label={`Original du passage : ${segment.text.slice(0, 60)}${segment.text.length > 60 ? '…' : ''}`}
    onClick={(e) => onOpen({ segment, anchor: e.currentTarget })}>
    <MoreVertical className="size-4" />
  </Button>;
}

function Action({ icon, title, hint, onClick, to }: { icon: ReactNode; title: string; hint?: string; onClick?: () => void; to?: string }) {
  const cls = 'flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#ececee] bg-background p-3 text-left text-foreground no-underline transition-transform active:scale-[.98]';
  const body = <><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>
    <span className="flex flex-col"><span className="text-[15px] font-semibold">{title}</span>{hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}</span></>;
  return to ? <Link to={to} onClick={onClick} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

export function OriginalMenu({ detail, variant, original, state, onClose }: {
  detail: ContentDetail; variant: ContentVariant; original: Original;
  state: OriginalMenuState | null; onClose: () => void;
}) {
  const [reading, setReading] = useState<ContentSegment[] | null>(null);
  const passages = useDossierPassages(detail);
  const { cited, listenable, jump } = useOriginalPassage(detail, variant, original, state?.segment);
  const sources = state ? sourcesForSegment(state.segment, passages ?? new Map()) : [];

  return <>
    {state && <Sheet title="Ce passage" onClose={onClose}>
      <p className="m-0 line-clamp-3 font-reading text-[15px] leading-relaxed text-muted-foreground">{state.segment.text}</p>
      {original.doc.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />Chargement de l’original…</div>}
      {original.doc.isError && <Action icon={<RotateCcw className="size-[18px]" />} title="Réessayer" hint="L’original n’a pas pu être chargé." onClick={() => void original.doc.refetch()} />}
      {original.doc.isSuccess && listenable && <Action icon={<Headphones className="size-[18px]" />} title="Écouter l’original ici" hint="Original, dès le premier passage cité"
        onClick={() => { if (jump()) onClose(); }} />}
      {original.doc.isSuccess && !listenable && cited.length > 0 && <Action icon={<BookOpen className="size-[18px]" />} title="Lire le passage original"
        onClick={() => { setReading(cited); onClose(); }} />}
      {original.doc.isSuccess && !listenable && !cited.length && <p className="m-0 text-sm text-muted-foreground">Aucun passage original connu.</p>}
      {sources.map((p) => <Action key={p.source.id} icon={<ExternalLink className="size-[18px]" />} title="Ouvrir la source" hint={p.source.title}
        to={sourceLink(p.source)} onClick={onClose} />)}
    </Sheet>}
    {reading !== null && <Sheet title="Passage original" onClose={() => setReading(null)} footer={<Button variant="ghost" onClick={() => setReading(null)}>Fermer</Button>}>
      <p className="m-0 text-sm text-muted-foreground">
        {original.source?.audio
          ? 'L’audio original n’est pas synchronisé de façon fiable : le passage est montré en texte, sans instant inventé.'
          : 'L’original de ce contenu est disponible en texte seul.'}
      </p>
      {reading.map((s) => <div key={s.id}>
        {s.speaker && <p className="m-0 mb-1 text-xs text-muted-foreground">{s.speaker}</p>}
        <p lang={original.source?.language} className="m-0 whitespace-pre-wrap font-reading text-[1.05rem] leading-[1.8]">{s.text}</p>
        {!!s.fr?.trim() && <p lang="fr" className="m-0 mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.fr}</p>}
      </div>)}
    </Sheet>}
  </>;
}
