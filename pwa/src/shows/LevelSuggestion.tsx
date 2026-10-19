import { Button } from '@/components/ui/button';
import { Notice, Spinner } from '@/components/ui/kit';
import type { Show } from '../api/shows';
import { suggestedLevelLabel } from './suggestionLogic';
import { useShowLevelSuggestion } from './useShowLevelSuggestion';

/** Une modification de niveau exige toujours un clic explicite. */
export function LevelSuggestion({ show, busy = false }: { show: Show; busy?: boolean }) {
  const { query, update, suggestion, apply, dismiss } = useShowLevelSuggestion(show);
  if (query.isPending) return <Spinner className="mt-2" label="Chargement du niveau suggéré" />;
  if (query.isError) return <Notice tone="warning" className="mt-2">
    <p className="m-0">Niveau suggéré indisponible. {query.error.message}</p>
    <Button variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>Réessayer</Button>
  </Notice>;
  if (!suggestion) return null;
  const locked = busy || update.isPending || query.isFetching;
  return <div className="mt-2 flex flex-col gap-2">
    <Notice>
      <p className="m-0 font-semibold">{suggestedLevelLabel(suggestion.suggestedLevel)}</p>
      <p className="mb-0 mt-1">{suggestion.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button disabled={locked} onClick={apply}>Appliquer</Button>
        <Button variant="ghost" disabled={locked} onClick={dismiss}>Ignorer</Button>
      </div>
    </Notice>
    {update.isError && <Notice tone="error">{update.error.message}</Notice>}
  </div>;
}
