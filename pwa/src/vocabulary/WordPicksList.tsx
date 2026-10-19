/** Liste paginée des sélections Discover ; supprimer ne retire pas le mot d’EnglishFluency. */
import { Button } from '../components/ui/button';
import { Notice, Spinner, cardCls } from '../components/ui/kit';
import { useOnline } from '../offline/OfflineBanner';
import { PICK_STATUS } from './validation';
import { useWordPickMutations, useWordPicks } from './useWordPicks';
export function WordPicksList() {
  const query = useWordPicks();
  const { remove } = useWordPickMutations();
  const online = useOnline();
  const picks = query.data?.pages.flatMap((page) => page.picks) ?? [];
  if (query.isPending) return online ? <Spinner label="Chargement des mots gardés" /> : <Notice>Mots gardés indisponibles hors ligne.</Notice>;
  return <section aria-label="Mots gardés" className="space-y-3">
    {!online && <Notice>Hors ligne : derniers mots conservés en mémoire.</Notice>}
    {query.isError && <Notice tone="error" action={<Button variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>}
    {!picks.length && !query.isError && <p className="text-sm text-muted-foreground">Aucun mot gardé pour le moment.</p>}
    <ul className="m-0 list-none space-y-3 p-0">{picks.map((pick) => <li key={pick.id} className={`${cardCls} space-y-2 p-4`}>
      <p className="font-semibold">{pick.word}</p><p className="text-sm">{pick.sentence}</p>
      <p className="text-xs text-muted-foreground">{PICK_STATUS[pick.status]}</p>
      <Button variant="ghost" disabled={!online || remove.isPending} aria-label={`Supprimer ${pick.word}`} onClick={() => remove.mutate(pick.id)}>Supprimer</Button>
    </li>)}</ul>
    {remove.isError && <Notice tone="error">{remove.error.message}</Notice>}
    {query.hasNextPage && <Button variant="outline" disabled={!online || query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Voir plus</Button>}
  </section>;
}
