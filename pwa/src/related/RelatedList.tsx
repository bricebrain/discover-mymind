/** Voisins et groupes d'un article, épisode ou note ; aucune écriture implicite. */
import { Button } from '../components/ui/button';
import { Notice, Spinner, cardCls } from '../components/ui/kit';
import { useOnline } from '../offline/OfflineBanner';
import { useRelated } from './useRelated';
import { RelatedLinks } from './RelatedLinks';
import type { RelatedType } from './api';
export function RelatedList({ type, id }: { type: RelatedType; id: string }) {
  const query = useRelated(type, id);
  const online = useOnline();
  if (query.isPending) return online ? <Spinner label="Recherche de contenus liés" /> : <Notice>Rapprochements indisponibles hors ligne.</Notice>;
  if (query.isError) return <Notice tone="error" action={<Button variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>;
  if (!query.data.neighbors.length && !query.data.groups.length) return null;
  return <section className="space-y-3" aria-label="Voir aussi">
    <h2 className="m-0 font-display text-2xl font-normal">Voir aussi</h2>
    {!online && <Notice>Hors ligne : derniers rapprochements conservés.</Notice>}
    <RelatedLinks items={query.data.neighbors} />
    {query.data.groups.map((group) => <div key={group.groupId} className={`${cardCls} p-4`}>
      <h3 className="text-sm font-semibold">Même événement · {group.members.length} sources</h3>
      <p className="text-sm text-muted-foreground">{group.title}</p><RelatedLinks items={group.members} />
    </div>)}
  </section>;
}
