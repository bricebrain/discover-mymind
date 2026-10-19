import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Notice, Spinner, Switch } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { SegmentSources, useDossierPassages } from '../dossiers/SegmentSources';
import { OriginalButton, OriginalMenu, type OriginalMenuState } from '../listening/OriginalAccess';
import { useOriginal } from '../listening/useOriginal';
import { formatClock } from '../player/MiniPlayer';
import { useVariantTranscript } from './useVariantTranscript';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium">
    <Switch checked={checked} onChange={onChange} label={label} />{label}
  </label>;
}

export function VariantTranscript({ detail, variant, activePositionMs, verified, playing, onSeek }: {
  detail: ContentDetail; variant: ContentVariant; activePositionMs: number | null;
  verified: boolean; playing: boolean; onSeek: (positionSec: number) => void;
}) {
  const reading = useVariantTranscript(detail, variant, activePositionMs, playing);
  const { segments, translated } = reading;
  // Dossier multisource : chaque paragraphe renvoie à ses sources (chantier A).
  const passages = useDossierPassages(detail);
  // I3 : original de cette version, pour « Écouter l'original ici » ou lire le passage source.
  const original = useOriginal(detail, variant);
  const [menu, setMenu] = useState<OriginalMenuState | null>(null);
  // L'appui long ouvre le volet (Android : contextmenu) ; le clic qui suit ne doit pas déclencher le saut.
  const swallowClick = useRef(false);
  const openOriginalMenu = (state: OriginalMenuState) => {
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 400);
    setMenu(state);
  };
  if (segments.isPending) return <div className="grid place-items-center py-6"><Spinner label="Chargement de la transcription" /></div>;
  if (segments.isError) return <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void segments.refetch()}>Réessayer</Button>}>{segments.error.message}</Notice>;
  if (!segments.data.segments.length) return <Notice>Aucun texte disponible pour cette version.</Notice>;

  return <section className="mt-6">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
      <h2 className="m-0 font-display text-[1.6rem] font-normal">Transcription</h2>
      <div className="flex flex-wrap gap-x-4">
        {reading.canShowFrench && <Toggle label="Afficher le français" checked={reading.showFrench} onChange={reading.setShowFrench} />}
        {verified && <Toggle label="Suivre la lecture" checked={reading.follow} onChange={reading.setFollow} />}
      </div>
    </div>
    {variant.language.split('-')[0] !== 'fr' && !reading.canShowFrench && <p className="m-0 mb-3 text-sm text-muted-foreground">Français non disponible pour cette version.</p>}
    {reading.showFrench && translated.isFetching && <p role="status" className="m-0 text-sm">Chargement du français…</p>}
    {reading.showFrench && translated.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void translated.refetch()}>Réessayer</Button>}>La traduction française n’a pas pu être chargée.</Notice>}
    <div className="flex flex-col gap-1">
      {segments.data.segments.map((s, index) => {
        const active = index === reading.active;
        const navigable = verified && !!variant.audio && s.startMs !== null;
        const text = <>
          {(s.speaker || s.startMs !== null) && <span className="mb-1 block text-xs text-muted-foreground">
            {s.speaker}{s.speaker && s.startMs !== null ? ' · ' : ''}{s.startMs !== null ? formatClock(s.startMs / 1000) : ''}
          </span>}
          <span lang={variant.language} className="whitespace-pre-wrap font-reading text-[1.08rem] leading-[1.8]">{s.text}</span>
        </>;
        return <div key={s.id} ref={active ? reading.activeRef : undefined} aria-current={active ? 'true' : undefined}
          onContextMenu={original.available && s.sourceSegments?.length
            ? (e: ReactMouseEvent<HTMLDivElement>) => { e.preventDefault(); openOriginalMenu({ segment: s, anchor: e.currentTarget }); }
            : undefined}
          onClickCapture={original.available
            ? (e: ReactMouseEvent<HTMLDivElement>) => { if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); } }
            : undefined}
          className={cn('scroll-my-24 rounded-xl border-l-[3px] p-3 transition-colors duration-300',
            active ? 'border-primary bg-primary-soft' : 'border-transparent')}>
          {navigable ? <button type="button" onClick={() => onSeek(s.startMs! / 1000)} title={`Écouter depuis ${formatClock(s.startMs! / 1000)}`}
            className="block w-full rounded text-left">{text}</button> : <div>{text}</div>}
          {original.available && <OriginalButton segment={s} onOpen={openOriginalMenu} />}
          {passages && variant.kind !== 'source' && <SegmentSources segment={s} passages={passages} />}
          {reading.showFrench && <p lang="fr" className="m-0 mt-2 whitespace-pre-wrap font-reading leading-[1.7] text-muted-foreground">
            {reading.french.get(s.id) ?? (translated.isFetching ? '…' : 'Traduction non disponible pour ce passage.')}
          </p>}
        </div>;
      })}
    </div>
    <OriginalMenu detail={detail} variant={variant} original={original} state={menu} onClose={() => setMenu(null)} />
  </section>;
}
