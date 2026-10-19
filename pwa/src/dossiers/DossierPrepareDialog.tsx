import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, Select, Sheet, inputCls } from '@/components/ui/kit';
import { useDossierMutations, type Dossier, type DossierOptions } from '../api/dossiers';
import { LEVEL_OPTIONS, STYLE_OPTIONS } from '../queue/PrepareDialog';

const RANGE = { condensed: [8, 20], essentials: [3, 6] } as const;
const COVERAGE_OPTIONS = [['condensed', 'Condensé (synthèse détaillée)'], ['essentials', 'L’essentiel']] as const;

/** Options d'une synthèse commune : condensé ou l'essentiel (pas d'intégral pour plusieurs sources). */
export function DossierPrepareDialog({ dossier, onClose }: { dossier: Dossier; onClose: () => void }) {
  const [options, setOptions] = useState<DossierOptions>({ coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 12 });
  const { prepare } = useDossierMutations();
  const [min, max] = RANGE[options.coverage];
  const valid = Number.isInteger(options.targetMinutes) && options.targetMinutes >= min && options.targetMinutes <= max;
  return <Sheet title="Préparer le dossier" onClose={onClose} locked={prepare.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={prepare.isPending}>Annuler</Button>
    <Button disabled={!valid || prepare.isPending} onClick={() => prepare.mutate({ id: dossier.id, options }, { onSuccess: onClose })}>
      {prepare.isPending ? 'Envoi…' : 'Mettre à préparer'}
    </Button>
  </>}>
    <p className="m-0 text-[15px] font-semibold leading-snug">{dossier.title} <span className="font-normal text-muted-foreground">· {dossier.sources.length} sources</span></p>
    <Field label="Version">
      <Select value={options.coverage} options={COVERAGE_OPTIONS}
        onChange={(coverage) => setOptions((o) => ({ ...o, coverage, targetMinutes: coverage === 'condensed' ? 12 : 5 }))} />
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Niveau d’anglais"><Select value={options.level} options={LEVEL_OPTIONS} onChange={(level) => setOptions((o) => ({ ...o, level }))} /></Field>
      <Field label="Style"><Select value={options.style} options={STYLE_OPTIONS} onChange={(style) => setOptions((o) => ({ ...o, style }))} /></Field>
    </div>
    <Field label="Durée cible en minutes" error={!valid} hint={`Entre ${min} et ${max} minutes`}>
      <input type="number" inputMode="numeric" className={inputCls} value={options.targetMinutes} min={min} max={max} step={1} aria-invalid={!valid}
        onChange={(e) => setOptions((o) => ({ ...o, targetMinutes: Number(e.target.value) }))} />
    </Field>
    <p className="m-0 text-xs leading-relaxed text-muted-foreground">
      L’Atelier prépare chaque source, puis écrit une synthèse commune : les points communs sont dits une fois, les désaccords
      sont explicités et chaque paragraphe renvoie à ses sources. Les sources sont figées au lancement.
    </p>
    {prepare.isError && <Notice tone="error">{prepare.error.message}</Notice>}
  </Sheet>;
}
