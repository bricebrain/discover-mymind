import { MAX_SOURCES, MIN_SOURCES, type DossierRef } from '../api/dossiers';
export interface SelectionRef extends DossierRef { title: string }
export const sameRef = (a: DossierRef, b: DossierRef) => a.type === b.type && a.id === b.id;
export function toggleSelection(current: SelectionRef[], ref: SelectionRef): SelectionRef[] {
  if (current.some((item) => sameRef(item, ref))) return current.filter((item) => !sameRef(item, ref));
  return current.length >= MAX_SOURCES ? current : [...current, ref];
}
export const canCreateDossier = (items: SelectionRef[]) => items.length >= MIN_SOURCES && items.length <= MAX_SOURCES;
