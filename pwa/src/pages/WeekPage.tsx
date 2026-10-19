import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, Spinner } from '@/components/ui/kit';
import { weeklyError } from '../weekly/api';
import { isEmptyWeek, weekLabel } from '../weekly/helpers';
import { useWeekly } from '../weekly/useWeekly';
import { WeeklyActivities } from '../weekly/WeeklyActivities';
import { WeeklyMetrics } from '../weekly/WeeklyMetrics';

export function WeekPage() {
  const { week, currentWeek, online, query, exportWeek, move, canPrevious, canNext } = useWeekly();
  const report = query.isError && online ? undefined : query.data;
  return <div className="mx-auto max-w-[720px] px-4 pb-8 pt-3">
    <h1 className="sr-only">Ma semaine</h1>
    <nav aria-label="Choisir la semaine" className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Semaine précédente" disabled={!canPrevious} onClick={() => move(-1)}><ChevronLeft className="size-5" /></Button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite" aria-atomic="true">
        <p className="text-sm font-semibold">{week}{week === currentWeek ? ' · en cours' : ''}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{weekLabel(week)}</p>
      </div>
      <Button variant="outline" size="icon" aria-label="Semaine suivante" disabled={!canNext} onClick={() => move(1)}><ChevronRight className="size-5" /></Button>
    </nav>
    <p className="mt-3 text-xs text-muted-foreground">Du lundi au dimanche · Europe/Paris</p>
    <div className="mt-4 flex flex-col gap-3">
      <Button variant="outline" disabled={!online || exportWeek.isPending} onClick={() => exportWeek.mutate(week)}>
        {exportWeek.isPending ? <Spinner label="Préparation de l’export" /> : <Download className="size-4" />}Exporter pour NotebookLM
      </Button>
      {exportWeek.isError && <Notice tone="error">{weeklyError(exportWeek.error)}</Notice>}
      {exportWeek.isSuccess && <Notice tone="success">Téléchargement du Markdown lancé. Tu peux l’importer dans NotebookLM.</Notice>}
      {!online && <Notice tone="warning">Tu es hors ligne. {report ? 'Le dernier bilan chargé reste affiché ; il sera actualisé au retour du réseau.' : 'Connecte-toi pour charger le bilan de cette semaine.'}</Notice>}
      {online && query.isError && <Notice tone="error" action={<Button variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>
        {weeklyError(query.error)}
      </Notice>}
      {online && query.isPending && <div className="flex justify-center py-8"><Spinner label="Chargement du bilan hebdomadaire" /></div>}
      {report && query.isFetching && !query.isPending && <Spinner label="Actualisation du bilan" />}
    </div>
    {report && <>
      {isEmptyWeek(report.metrics) && <Notice className="mt-5">Aucune activité enregistrée cette semaine. Une écoute, une lecture ou une note suffira à nourrir un prochain bilan.</Notice>}
      <WeeklyMetrics metrics={report.metrics} delta={report.delta} previousWeek={report.previousWeek} />
      <WeeklyActivities activities={report.activities} />
    </>}
  </div>;
}
