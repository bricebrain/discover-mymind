import { Ear } from 'lucide-react';
import { Notice, Spinner, cardCls } from '@/components/ui/kit';
import { CATEGORY_LABELS, useDictationProgress, type DictationProgress } from '../api/dictation';

const percent = (n: number) => `${Math.round(n * 100)} %`;
const shortWeek = (week: string) => new Date(`${week}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/**
 * Compréhension à l'oreille, mesurée par la dictée : part des phrases dont au moins 90 % des mots ont été reconnus,
 * semaine par semaine, et ce qui échappe le plus souvent. Plus parlant que le nombre de vidéos écoutées.
 */
export function EarProgress() {
  const progress = useDictationProgress();
  if (progress.isPending) return <Spinner label="Chargement de la progression à l’oreille" />;
  if (progress.isError) return <Notice tone="warning">Progression à l’oreille indisponible : {progress.error.message}</Notice>;
  return <EarProgressView data={progress.data} />;
}

export function EarProgressView({ data }: { data: DictationProgress }) {
  const weeks = data.weeks.slice(-8), current = weeks.at(-1), previous = weeks.at(-2);
  if (!current) return <section className={`${cardCls} mt-5 p-4`} aria-label="Compréhension à l’oreille">
    <h2 className="m-0 flex items-center gap-2 text-base font-semibold"><Ear className="size-4" />Compréhension à l’oreille</h2>
    <p className="m-0 mt-2 text-sm text-muted-foreground">Fais une dictée dans l’original guidé d’un contenu pour suivre ta progression ici.</p>
  </section>;
  // Écart entre les pourcentages affichés, pour qu'il corresponde à ce qu'on lit.
  const trend = previous ? Math.round(current.understoodShare * 100) - Math.round(previous.understoodShare * 100) : null;
  const top = data.categories.slice(0, 4), max = Math.max(1, ...top.map((c) => c.count));
  return <section className={`${cardCls} mt-5 space-y-4 p-4`} aria-label="Compréhension à l’oreille">
    <div>
      <h2 className="m-0 flex items-center gap-2 text-base font-semibold"><Ear className="size-4" />Compréhension à l’oreille</h2>
      <p className="m-0 mt-2 font-display text-4xl tabular-nums">{percent(current.understoodShare)}</p>
      <p className="m-0 text-sm text-muted-foreground">
        des phrases dictées comprises à l’oreille (au moins {percent(data.understoodThreshold)} des mots), semaine du {shortWeek(current.week)}
        {trend !== null && ` · ${trend >= 0 ? '+' : '−'}${Math.abs(trend)} points`} · {current.sentences} phrase{current.sentences > 1 ? 's' : ''},
        {' '}{percent(current.wordAccuracy)} des mots reconnus
      </p>
    </div>
    {weeks.length > 1 && <div>
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Phrases comprises à l’oreille par semaine">
        {weeks.map((w) => <div key={w.week} className="flex h-full flex-1 flex-col justify-end" title={`Semaine du ${shortWeek(w.week)} : ${percent(w.understoodShare)} (${w.sentences} phrases)`}>
          <div className="min-h-[3px] rounded-t-[4px] bg-primary" style={{ height: `${Math.max(3, w.understoodShare * 100)}%` }} />
        </div>)}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">{weeks.map((w) => <span key={w.week} className="flex-1 text-center">{shortWeek(w.week)}</span>)}</div>
    </div>}
    {top.length > 0 && <div>
      <h3 className="m-0 mb-2 text-sm font-semibold">Ce qui t’échappe le plus (30 jours)</h3>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {top.map((c) => <li key={c.category} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
          <span>{CATEGORY_LABELS[c.category]}</span>
          <span className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} /></span>
          <span className="text-right tabular-nums text-muted-foreground">{c.count}</span>
        </li>)}
      </ul>
    </div>}
  </section>;
}
