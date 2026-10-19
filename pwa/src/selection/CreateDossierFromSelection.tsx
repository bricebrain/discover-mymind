/** Crée le dossier, puis ouvre ses options ; aucune préparation lancée implicitement. */
import { useState } from 'react';
import { Notice } from '../components/ui/kit';
import { useDossierMutations, type Dossier } from '../api/dossiers';
import { DossierPrepareDialog } from '../dossiers/DossierPrepareDialog';
import { SelectionBar } from './SelectionBar';
import { canCreateDossier } from './model';
import { useSelection } from './useSelection';
export function CreateDossierFromSelection() {
  const selection = useSelection();
  const { create } = useDossierMutations();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  function submit() {
    if (create.isPending || !canCreateDossier(selection.items)) return;
    create.mutate({ title: 'Nouveau dossier', sources: selection.items.map(({ type, id }) => ({ type, id })) }, {
      onSuccess: ({ dossier: created }) => { setDossier(created); selection.cancel(); },
    });
  }
  return <>
    <SelectionBar onCreate={submit} busy={create.isPending} />
    {selection.active && create.isError && <Notice tone="error">{create.error.message}</Notice>}
    {dossier && <DossierPrepareDialog dossier={dossier} onClose={() => setDossier(null)} />}
  </>;
}
