import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Notice, Select, Sheet, inputCls } from '@/components/ui/kit';
import type { PrepTarget } from '../api/queue';
import { COVERAGES, LEVEL_OPTIONS } from './options';
import type { PrepareOptions } from './types';
import { usePreparation } from './usePreparation';
import { CloudPrepareDialog } from '../cloud/CloudPrepareDialog';

export { LEVEL_OPTIONS } from './options';
export const STYLE_OPTIONS = [['narration', 'Narration'], ['dialogue', 'Dialogue']] as const;

/** Options communes aux épisodes, vidéos et notes ; la copie de l’audio original concerne les épisodes. */
export function PrepareDialog({target,title,initial,faithfulAllowed,onClose,onQueued}: {
  target: PrepTarget; title: string; initial: PrepareOptions; faithfulAllowed: boolean; onClose:() => void; onQueued?:() => void;
}) {
  const [options,setOptions] = useState(initial);
  const [cloud,setCloud] = useState(false);
  const {prepare} = usePreparation(target);
  const set = <K extends keyof PrepareOptions>(key: K,value: PrepareOptions[K]) => setOptions((o) => ({...o,[key]:value}));
  const range = options.coverage==='condensed' ? [8,20] : [3,6];
  const valid = options.coverage==='full' || (Number.isInteger(options.targetMinutes) && options.targetMinutes!>=range[0]! && options.targetMinutes!<=range[1]!);
  if (cloud) return <CloudPrepareDialog target={target} title={title} onClose={()=>setCloud(false)} onQueued={()=>{onQueued?.();onClose();}} />;
  return <Sheet title="Préparer en anglais" onClose={onClose} locked={prepare.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={prepare.isPending}>Annuler</Button>
    <Button disabled={!valid || prepare.isPending} onClick={() => prepare.mutate(options,{onSuccess:() => { onQueued?.(); onClose(); }})}>
      {prepare.isPending ? 'Envoi…' : 'Mettre à préparer'}
    </Button>
  </>}>
    <p className="m-0 text-[15px] font-semibold leading-snug">{title}</p>
    {target.kind!=='episode' && <Button variant="outline" disabled={prepare.isPending} onClick={()=>setCloud(true)}>Préparer sans Mac</Button>}
    <Field label="Version">
      <Select aria-label="Version" value={options.coverage} options={Object.entries(COVERAGES) as [PrepareOptions['coverage'], string][]} onChange={(coverage) =>
        setOptions((o) => ({...o,coverage,targetMinutes:coverage==='full' ? null : coverage==='condensed' ? 12 : 4}))} />
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Niveau d’anglais"><Select value={options.level} options={LEVEL_OPTIONS} onChange={(v) => set('level',v)} /></Field>
      <Field label="Style"><Select value={options.style} options={STYLE_OPTIONS} onChange={(v) => set('style',v)} /></Field>
    </div>
    {options.coverage!=='full' && <Field label="Durée cible en minutes" error={!valid} hint={`Entre ${range[0]} et ${range[1]} minutes`}>
      <input type="number" inputMode="numeric" className={inputCls} value={options.targetMinutes ?? ''} min={range[0]} max={range[1]} step={1}
        aria-invalid={!valid} onChange={(e) => set('targetMinutes',Number(e.target.value))} />
    </Field>}
    {(faithfulAllowed || target.kind==='episode') && <div className="-my-1">
      {faithfulAllowed && <Checkbox checked={options.faithful} onChange={(v) => set('faithful',v)} label="Ajouter l’anglais fidèle intégral" />}
      {target.kind==='episode' && <Checkbox checked={options.keepOriginalCopy} onChange={(v) => set('keepOriginalCopy',v)} label="Garder une copie synchronisée de l’original" />}
    </div>}
    <p className="m-0 text-xs leading-relaxed text-muted-foreground">L’Atelier sur ton Mac prépare le texte et l’audio, puis publie la version dans Discover. Si le contrôle de fidélité signale des points, la version est marquée « non relue ».</p>
    {prepare.isError && <Notice tone="error">{prepare.error.message}</Notice>}
  </Sheet>;
}
