import { cardCls, SectionTitle } from '@/components/ui/kit';
import { formatDelta, formatNumber } from './helpers';
import type { WeeklyMetrics as Metrics } from './types';

const METRICS: readonly [keyof Metrics, string][] = [
  ['listenedMinutes', 'Minutes écoutées'], ['completedContents', 'Contenus terminés'],
  ['notesCreated', 'Notes créées'], ['notesModified', 'Notes modifiées'],
  ['articlesRead', 'Articles lus'], ['articlesSaved', 'Articles enregistrés'],
  ['linkedPassages', 'Passages liés'], ['publishedPreparations', 'Préparations publiées'],
];

export function WeeklyMetrics({ metrics, delta, previousWeek }: { metrics: Metrics; delta: Metrics; previousWeek: string }) {
  return <section aria-label="Chiffres clés">
    <SectionTitle>Cette semaine</SectionTitle>
    <p className="mb-3 text-xs text-muted-foreground">Écarts en valeur absolue par rapport à {previousWeek}.</p>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {METRICS.map(([key, label]) => <div key={key} className={`${cardCls} min-w-0 p-3`}>
        <dt className="min-h-10 text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(metrics[key])}</dd>
        <dd className="mt-1 text-xs text-muted-foreground" aria-label={`${label} : ${formatDelta(delta[key])} par rapport à la semaine précédente`}>
          {formatDelta(delta[key])}
        </dd>
      </div>)}
    </dl>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
      Les minutes sont estimées à partir de la progression audio, sauts en avant inclus. Un article « lu » est un article ouvert.
      L’historique antérieur à la mise en place du suivi peut être partiel. Les écoutes hors ligne sont comptées lors de leur synchronisation.
    </p>
  </section>;
}
