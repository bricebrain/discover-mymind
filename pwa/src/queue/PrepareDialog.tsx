import { useQuery } from '@tanstack/react-query';
import { Cloud, Laptop } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Notice, Select, Sheet, inputCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { PrepTarget } from '../api/queue';
import { CloudPrepareDialog } from '../cloud/CloudPrepareDialog';
import { cloudApi, dollars } from '../cloud/api';
import { COVERAGES, EXPLANATION_LEVEL_OPTIONS, LEVEL_OPTIONS } from './options';
import type { PrepareOptions } from './types';
import { usePreparation } from './usePreparation';

export { LEVEL_OPTIONS } from './options';
export const STYLE_OPTIONS = [['narration', 'Narration'], ['dialogue', 'Dialogue']] as const;

/** Carte de choix du lieu de préparation : icône, titre, disponibilité (point vert ou orange). */
function PlaceCard({ icon, title, hint, ok, selected, onClick }: { icon: ReactNode; title: string; hint: string; ok: boolean | null; selected: boolean; onClick: () => void }) {
  return <motion.button type="button" role="radio" aria-checked={selected} onClick={onClick} whileTap={{ scale: 0.96 }}
    className={cn('relative flex flex-col items-start gap-2 rounded-[20px] border-[1.5px] p-3 text-left transition-colors',
      selected ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted')}>
    <span className={cn('grid size-10 place-items-center rounded-2xl', selected ? 'bg-grad-primary text-white' : 'bg-muted text-foreground')}>{icon}</span>
    <span className="text-[15px] font-semibold leading-tight">{title}</span>
    <span className="flex items-center gap-1.5 text-[12px] leading-snug text-muted-foreground">
      {ok !== null && <span className={cn('size-1.5 shrink-0 rounded-full', ok ? 'bg-emerald-500' : 'bg-amber-500')} />}{hint}
    </span>
  </motion.button>;
}

/** Options communes aux épisodes, vidéos et notes ; la copie de l’audio original concerne les épisodes. */
export function PrepareDialog({target,title,initial,faithfulAllowed,onClose,onQueued}: {
  target: PrepTarget; title: string; initial: PrepareOptions; faithfulAllowed: boolean; onClose:() => void; onQueued?:() => void;
}) {
  const [options,setOptions] = useState(initial);
  const [cloud,setCloud] = useState(false);
  const {prepare,query} = usePreparation(target);
  const cloudStatus = useQuery({queryKey:['cloud-status'],queryFn:cloudApi.status,retry:false,staleTime:60_000});
  const set = <K extends keyof PrepareOptions>(key: K,value: PrepareOptions[K]) => setOptions((o) => ({...o,[key]:value}));
  const guided = options.coverage==='guided';
  const range = options.coverage==='condensed' ? [8,20] : [3,6];
  const valid = options.coverage==='full' || guided || (Number.isInteger(options.targetMinutes) && options.targetMinutes!>=range[0]! && options.targetMinutes!<=range[1]!);
  if (cloud) return <CloudPrepareDialog target={target} title={title} onClose={()=>setCloud(false)} onQueued={()=>{onQueued?.();onClose();}} />;

  const seenAt = query.data?.atelierSeenAt ? Date.parse(query.data.atelierSeenAt) : null;
  const macOnline = seenAt !== null && Date.now() - seenAt < 180_000;
  const c = cloudStatus.data;
  const cloudLeft = c?.limitMicros !== undefined && c.reservedMicros !== undefined ? c.limitMicros - c.reservedMicros : null;
  const cloudHint = !c ? 'Vérification…' : !c.enabled ? 'Pas encore activé' : cloudLeft !== null ? `${dollars(Math.max(0, cloudLeft))} restants ce mois` : 'Disponible';

  return <Sheet title="Préparer en anglais" onClose={onClose} locked={prepare.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={prepare.isPending}>Annuler</Button>
    <Button disabled={!valid || prepare.isPending} onClick={() => prepare.mutate(options,{onSuccess:() => { onQueued?.(); onClose(); }})}>
      {prepare.isPending ? 'Envoi…' : 'Préparer sur le Mac'}
    </Button>
  </>}>
    <p className="m-0 text-[15px] font-semibold leading-snug">{title}</p>
    {/* Où préparer : deux cartes, avec la disponibilité de chacune. */}
    <div role="radiogroup" aria-label="Lieu de préparation" className="grid grid-cols-2 gap-2.5">
      <PlaceCard icon={<Laptop className="size-5" />} title="Sur le Mac" ok={seenAt === null ? false : macOnline} selected
        hint={macOnline ? 'Atelier en ligne · toutes les options' : 'Mac éteint ? La demande attendra'} onClick={() => {}} />
      <PlaceCard icon={<Cloud className="size-5" />} title="Sans Mac" ok={c ? !!c.enabled && (cloudLeft === null || cloudLeft > 0) : null} selected={false}
        hint={`L’essentiel · ${cloudHint}`} onClick={() => setCloud(true)} />
    </div>
    <Field label="Version">
      <Select aria-label="Version" value={options.coverage} options={Object.entries(COVERAGES) as [PrepareOptions['coverage'], string][]} onChange={(coverage) =>
        setOptions((o) => ({...o,coverage,targetMinutes:coverage==='full' || coverage==='guided' ? null : coverage==='condensed' ? 12 : 4,
          ...(coverage==='guided' ? {style:'narration',faithful:false,level:o.level==='original' ? 'B1' : o.level} : {})}))} />
    </Field>
    {guided ? <>
      <Field label="Niveau des explications"><Select value={options.level} options={EXPLANATION_LEVEL_OPTIONS} onChange={(v) => set('level',v)} /></Field>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">L’anglais n’est jamais simplifié : une vidéo anglaise reste l’original, une source française est traduite en anglais naturel et lue en entier. Le guide (passage de 2 à 5 minutes, expressions, quiz) est rédigé à ton niveau.</p>
    </> : <div className="grid grid-cols-2 gap-3">
      <Field label="Niveau d’anglais"><Select value={options.level} options={LEVEL_OPTIONS} onChange={(v) => set('level',v)} /></Field>
      <Field label="Style"><Select value={options.style} options={STYLE_OPTIONS} onChange={(v) => set('style',v)} /></Field>
    </div>}
    {options.coverage!=='full' && !guided && <Field label="Durée cible en minutes" error={!valid} hint={`Entre ${range[0]} et ${range[1]} minutes`}>
      <input type="number" inputMode="numeric" className={inputCls} value={options.targetMinutes ?? ''} min={range[0]} max={range[1]} step={1}
        aria-invalid={!valid} onChange={(e) => set('targetMinutes',Number(e.target.value))} />
    </Field>}
    {!guided && (faithfulAllowed || target.kind==='episode') && <div className="-my-1">
      {faithfulAllowed && <Checkbox checked={options.faithful} onChange={(v) => set('faithful',v)} label="Ajouter l’anglais fidèle intégral" />}
      {target.kind==='episode' && <Checkbox checked={options.keepOriginalCopy} onChange={(v) => set('keepOriginalCopy',v)} label="Garder une copie synchronisée de l’original" />}
    </div>}
    <p className="m-0 text-xs leading-relaxed text-muted-foreground">L’Atelier sur ton Mac prépare le texte et l’audio, puis publie la version dans Discover. Tu suivras chaque étape et le temps restant dans la file. Si le contrôle de fidélité signale des points, la version est marquée « non relue ».</p>
    {prepare.isError && <Notice tone="error">{prepare.error.message}</Notice>}
  </Sheet>;
}
