/** Groupe fourni par useEventGroups ; la création reste une action explicite du parent. */
import type { DossierRef } from '../api/dossiers';
import { Button } from '../components/ui/button';
import { Notice, cardCls } from '../components/ui/kit';
import { useOnline } from '../offline/OfflineBanner';
import type { EventGroup } from './api';
import { RelatedLinks } from './RelatedLinks';
export function EventGroupCard({ group, onCreateDossier, onDismiss }: {
  group: EventGroup; onCreateDossier: (refs: DossierRef[]) => void; onDismiss?: () => void;
}) {
  const online = useOnline();
  if (group.members.length < 2) return null;
  const selectable = group.members.length <= 6;
  return <article className={`${cardCls} space-y-3 p-4`}>
    <h3 className="m-0 font-display text-2xl font-normal">{group.title}</h3>
    <div className="flex flex-wrap gap-2">{[...new Set(group.members.map((m) => m.publisher))].map((publisher) =>
      <span key={publisher} className="rounded-full bg-muted px-2 py-1 text-xs">{publisher}</span>)}</div>
    <RelatedLinks items={group.members.slice(0, 3)} />
    {group.dossierCandidate && <Button disabled={!online || !selectable} onClick={() => onCreateDossier(group.members.map(({ type, id }) => ({ type, id })))}>Préparer un condensé</Button>}
    {!online && <Notice>Reconnecte-toi pour créer un dossier.</Notice>}
    {!selectable && <p className="text-xs text-muted-foreground">Sélectionne de 2 à 6 sources pour créer un dossier.</p>}
    {onDismiss && <Button variant="ghost" onClick={onDismiss}>Masquer</Button>}
  </article>;
}
