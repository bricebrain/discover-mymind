import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { Button as MuiButton, Typography } from '@mui/material';
import { BookOpen, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, Spinner, Switch } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { SegmentSources, useDossierPassages } from '../dossiers/SegmentSources';
import { OriginalMenu } from '../listening/OriginalAccess';
import { useOriginal } from '../listening/useOriginal';
import { formatClock } from '../player/MiniPlayer';
import { WordPickSheet } from '../vocabulary/WordPickSheet';
import { usePassageActions } from './usePassageActions';
import { useVariantTranscript } from './useVariantTranscript';
import { AnnotatedText } from './AnnotatedText';
import { annotationsBySegment } from './annotations';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium">
    <Switch checked={checked} onChange={onChange} label={label} />{label}
  </label>;
}

export function VariantTranscript({ detail, variant, activePositionMs, verified, playing, onSeek, hidden = false, onReveal }: {
  detail: ContentDetail; variant: ContentVariant; activePositionMs: number | null;
  verified: boolean; playing: boolean; onSeek: (positionSec: number) => void;
  /** Écoute sans aide (original guidé) : le texte attend qu'on le demande. */
  hidden?: boolean; onReveal?: () => void;
}) {
  const reading = useVariantTranscript(detail, variant, activePositionMs, playing);
  const { segments, translated } = reading;
  const annotations = useMemo(() => annotationsBySegment(segments.data?.guide?.annotations), [segments.data]);
  // Dossier multisource : chaque paragraphe renvoie à ses sources (chantier A).
  const passages = useDossierPassages(detail);
  // I3 : original de cette version, pour « Écouter l'original ici » ou lire le passage source.
  const original = useOriginal(detail, variant);
  const english = variant.language.split('-')[0] === 'en';
  const actions = usePassageActions(english);
  const selectedIndex = segments.data?.segments.findIndex((s) => s.id === actions.menu?.segment.id) ?? -1;
  if (segments.isPending) return <div className="grid place-items-center py-6"><Spinner label="Chargement de la transcription" /></div>;
  if (segments.isError) return <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void segments.refetch()}>Réessayer</Button>}>{segments.error.message}</Notice>;
  if (!segments.data.segments.length) return <Notice>Aucun texte disponible pour cette version.</Notice>;
  if (hidden) return <section className="mt-6">
    <Notice action={onReveal && <Button size="sm" variant="ghost" onClick={onReveal}>Afficher le texte</Button>}>
      Texte masqué : écoute d’abord sans aide.
    </Notice>
  </section>;

  return <section className="mt-6">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
      <h2 className="m-0 font-display text-[1.6rem] font-normal">Transcription</h2>
      <div className="flex flex-wrap gap-x-4">
        {reading.canShowFrench && <Toggle label="Afficher le français" checked={reading.showFrench} onChange={reading.setShowFrench} />}
        {verified && <Toggle label="Suivre la lecture" checked={reading.follow} onChange={reading.setFollow} />}
      </div>
    </div>
    {variant.language.split('-')[0] !== 'fr' && !reading.canShowFrench && <p className="m-0 mb-3 text-sm text-muted-foreground">Français non disponible pour cette version.</p>}
    {segments.data.guide?.annotations !== undefined && <Typography sx={{ mb: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
      {segments.data.guide.annotations.length ? 'Touche les expressions soulignées pour comprendre leur sens en français, tout au long du texte.'
        : 'Le texte a été analysé : aucune difficulté particulière n’a été retenue pour ce niveau.'}
    </Typography>}
    {reading.showFrench && translated.isFetching && <p role="status" className="m-0 text-sm">Chargement du français…</p>}
    {reading.showFrench && translated.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void translated.refetch()}>Réessayer</Button>}>La traduction française n’a pas pu être chargée.</Notice>}
    <div className="flex flex-col gap-1">
      {segments.data.segments.map((s, index) => {
        const active = index === reading.active;
        const notes = annotations.get(s.id) ?? [];
        const navigable = verified && !!variant.audio && s.startMs !== null;
        const text = <>
          {(s.speaker || s.startMs !== null) && <span className="mb-1 block text-xs text-muted-foreground">
            {s.speaker}{s.speaker && s.startMs !== null ? ' · ' : ''}{s.startMs !== null ? formatClock(s.startMs / 1000) : ''}
          </span>}
          <span data-passage-text lang={variant.language} className="whitespace-pre-wrap font-reading text-[1.08rem] leading-[1.8]">{notes.length ? <AnnotatedText key={`${detail.publicationId}:${variant.key}:${s.id}`} detail={detail} variant={variant}
            segment={s} segmentIndex={index} annotations={notes} onPlay={navigable ? () => onSeek(s.startMs! / 1000) : undefined} /> : s.text}</span>
        </>;
        return <div key={s.id} ref={active ? reading.activeRef : undefined} aria-current={active ? 'true' : undefined}
          onPointerUp={(e) => actions.afterSelection(e.currentTarget, s)}
          onKeyUp={(e) => { if (e.shiftKey) actions.afterSelection(e.currentTarget, s); }}
          onContextMenu={english || (original.available && s.sourceSegments?.length)
            ? (e: ReactMouseEvent<HTMLDivElement>) => { e.preventDefault(); actions.open({ segment: s, anchor: e.currentTarget }); }
            : undefined}
          onClickCapture={(e) => { if (actions.swallowClick()) { e.preventDefault(); e.stopPropagation(); } }}
          className={cn('scroll-my-24 rounded-xl border-l-[3px] p-3 transition-colors duration-300',
            active ? 'border-primary bg-primary-soft' : 'border-transparent')}>
          {notes.length ? <div>{text}{navigable && <MuiButton size="small" onClick={() => onSeek(s.startMs! / 1000)}>Écouter cette phrase</MuiButton>}</div> : navigable ? <button type="button" onClick={() => onSeek(s.startMs! / 1000)} title={`Écouter depuis ${formatClock(s.startMs! / 1000)}`}
            className="block w-full select-text rounded text-left">{text}</button> : <div>{text}</div>}
          {(english || (original.available && !!s.sourceSegments?.length)) && <Button variant="ghost" size="icon" className="mt-1 text-muted-foreground"
            aria-label={`Actions du passage ${index + 1}`} onClick={(e) => actions.open({ segment: s, anchor: e.currentTarget.parentElement! })}>
            <MoreVertical className="size-4" />
          </Button>}
          {passages && variant.kind !== 'source' && <SegmentSources segment={s} passages={passages} />}
          {reading.showFrench && <p lang="fr" className="m-0 mt-2 whitespace-pre-wrap font-reading leading-[1.7] text-muted-foreground">
            {reading.french.get(s.id) ?? (translated.isFetching ? '…' : 'Traduction non disponible pour ce passage.')}
          </p>}
        </div>;
      })}
    </div>
    <OriginalMenu detail={detail} variant={variant} original={original} state={actions.menu} onClose={actions.closeMenu}
      extraActions={english && selectedIndex >= 0 ? <Button variant="outline" className="min-h-14 justify-start whitespace-normal text-left" onClick={() => actions.keepWord(selectedIndex)}>
        <BookOpen className="size-5" />Garder un mot ou une expression
      </Button> : undefined} />
    {actions.pick && <WordPickSheet key={`${variant.key}:${actions.pick.index}`} word={actions.pick.word} sentence={actions.pick.segment.text}
      contentId={detail.content.id} publicationId={detail.publicationId} variantKey={variant.key} segmentIndex={actions.pick.index} onClose={actions.closePick} />}
  </section>;
}
