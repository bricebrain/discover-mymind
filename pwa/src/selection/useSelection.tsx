import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { sameRef, toggleSelection, type SelectionRef } from './model';
interface SelectionContextValue {
  active: boolean; items: SelectionRef[]; start: (ref: SelectionRef) => void; toggle: (ref: SelectionRef) => void;
  cancel: () => void; contains: (ref: SelectionRef) => boolean;
}
const SelectionContext = createContext<SelectionContextValue | null>(null);
/** Un fournisseur autour des cartes et de la barre ; le retour Android ferme d'abord la sélection. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<SelectionRef[]>([]);
  const marker = useRef(false);
  useEffect(() => {
    const onBack = () => { marker.current = false; setItems([]); setActive(false); };
    window.addEventListener('popstate', onBack);
    return () => {
      window.removeEventListener('popstate', onBack);
      if (marker.current && window.history.state?.discoverSelection) window.history.back();
    };
  }, []);
  function cancel() {
    setItems([]); setActive(false);
    if (marker.current && window.history.state?.discoverSelection) {
      marker.current = false;
      window.history.back();
    }
  }
  function start(ref: SelectionRef) {
    if (!marker.current) {
      window.history.pushState({ ...window.history.state, discoverSelection: true }, '');
      marker.current = true;
    }
    setItems([ref]); setActive(true);
  }
  return <SelectionContext.Provider value={{ active, items, cancel,
    start,
    toggle: (ref) => setItems((current) => toggleSelection(current, ref)),
    contains: (ref) => items.some((item) => sameRef(item, ref)),
  }}>{children}</SelectionContext.Provider>;
}
export function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error('useSelection exige SelectionProvider.');
  return value;
}
