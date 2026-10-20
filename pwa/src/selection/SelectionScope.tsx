import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SelectionProvider } from './useSelection';
import { CreateDossierFromSelection } from './CreateDossierFromSelection';
/** Changer d'écran/fil remet la sélection à zéro ; un changement de version reste dans le même contexte. */
export function SelectionScope({ children }: { children: ReactNode }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.delete('v');
  return <SelectionProvider key={`${location.pathname}?${params}`}>
    {children}<CreateDossierFromSelection />
  </SelectionProvider>;
}
