/** bottomClassName permet au Shell de réserver la hauteur réelle du mini-lecteur. */
import { createPortal } from 'react-dom';
import { Notice } from '../components/ui/kit';
import { Button } from '../components/ui/button';
import { useOnline } from '../offline/OfflineBanner';
import { canCreateDossier } from './model';
import { useSelection } from './useSelection';
export function SelectionBar({ onCreate, busy = false, error, bottomClassName = 'bottom-[calc(72px+var(--player-h,0px)+env(safe-area-inset-bottom))]' }: {
  onCreate: () => void; busy?: boolean; error?: string; bottomClassName?: string;
}) {
  const selection = useSelection();
  const online = useOnline();
  if (!selection.active) return null;
  return createPortal(<aside aria-label="Sélection de sources" className={`fixed inset-x-3 z-[1200] mx-auto max-w-xl rounded-2xl border border-border bg-card p-3 shadow-xl ${bottomClassName}`}>
    {error && <Notice tone="error">{error}</Notice>}
    <p role="status" className="mb-2 text-sm font-semibold">{selection.items.length} sélectionnés · 2 à 6 sources</p>
    <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={selection.cancel}>Annuler</Button>
      <Button disabled={!online || busy || !canCreateDossier(selection.items)} onClick={onCreate}>{busy ? 'Création…' : 'Créer un dossier'}</Button></div>
  </aside>, document.body);
}
