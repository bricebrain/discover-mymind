import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Notice, Spinner } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useContent, type ContentVariant } from '../api/contents';
import { DeleteContentButton } from '../content/DeleteContentButton';
import { PlaybackControls } from '../content/VariantControls';
import { VersionLearning } from '../content/VersionLearning';
import { VariantTranscript } from '../content/VariantTranscript';
import { useContentReader } from '../content/useContentReader';
import { durationLabel, languageName, variantName } from '../content/variants';
import { DownloadButton } from '../offline/DownloadButton';

/** Les versions préparées d'abord (ce qu'on vient chercher), l'original en dernier. */
const order = (v: ContentVariant) => (v.kind === 'adaptation' ? 0 : v.kind === 'faithful_translation' ? 1 : 2);

/** Une évaluation publiée sans relecture et avec des points signalés. */
export function unreviewed(v: ContentVariant): boolean {
  const e = (v as ContentVariant & { evaluation?: { verdict?: string; acceptedByUser?: boolean } }).evaluation;
  return !!e && e.verdict !== undefined && e.verdict !== 'ok' && e.acceptedByUser !== true;
}

const overline = 'm-0 mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground';

/** Pastilles de version (Anglais, Original, Condensé B1…), défilantes, avec durée et mention « non relue ». */
export function VariantPills({ variants, value, onSelect }: { variants: ContentVariant[]; value: string; onSelect: (key: string) => void }) {
  return <div role="radiogroup" aria-label="Version à écouter" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {[...variants].sort((a, b) => order(a) - order(b)).map((v) => {
      const on = v.key === value;
      return <button key={v.key} type="button" role="radio" aria-checked={on} onClick={() => onSelect(v.key)}
        className={cn('flex min-w-32 shrink-0 flex-col items-start rounded-2xl border-[1.5px] px-3.5 py-2 text-left transition-colors active:scale-[.98]',
          on ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted')}>
        <span className={cn('text-[14px] font-bold', on ? 'text-primary' : 'text-foreground')}>{variantName(v)}</span>
        <span className="text-xs text-muted-foreground">{languageName(v.language)} · {v.audio ? durationLabel(v.audio.durationMs) : 'texte seul'}</span>
        {unreviewed(v) && <span className="text-xs font-semibold text-amber-700">non relue</span>}
      </button>;
    })}
  </div>;
}

/**
 * Versions préparées d'un épisode, directement dans son détail (Explorer ou Bibliothèque) :
 * pastilles de version, écoute de la version choisie, transcription synchronisée. Rien ne change de page.
 */
export function PreparedEpisode({ contentId, about, onDeleted, showId }: { contentId: string; about: ReactNode; onDeleted?: () => void; showId?: string }) {
  const query = useContent(contentId);
  const reader = useContentReader(query.data);
  const variant = reader.variant;

  if (query.isPending) return <div className="grid place-items-center py-6"><Spinner label="Chargement des versions" /></div>;
  if (query.isError) return <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>;
  if (!variant) return <Notice>Aucune version disponible pour cet épisode.</Notice>;

  return <section>
    <p className={overline}>Versions</p>
    <VariantPills variants={query.data.variants} value={variant.key} onSelect={reader.select} />
    {unreviewed(variant) && <Notice tone="warning" className="mb-3">
      Publiée automatiquement : le contrôle de fidélité a signalé des points à vérifier. Garde un œil critique sur les chiffres et les noms.
    </Notice>}
    <PlaybackControls reader={reader} />
    <DownloadButton detail={query.data} variant={variant} />
    <VariantTranscript key={`transcript:${query.data.publicationId}:${variant.key}`} detail={query.data} variant={variant}
      activePositionMs={reader.activePositionMs} verified={reader.verified} playing={reader.playing} onSeek={reader.play} />
    <VersionLearning key={`learning:${query.data.publicationId}:${variant.key}`} detail={query.data} variant={variant} verified={reader.verified} onSeek={reader.play} showId={showId} />
    <div className="mt-4"><DeleteContentButton id={contentId} title={query.data.content.title} onDeleted={onDeleted} /></div>
    {about && <div className="mt-8"><p className={overline}>À propos de l’épisode</p>{about}</div>}
  </section>;
}
