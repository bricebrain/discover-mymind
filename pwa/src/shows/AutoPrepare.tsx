import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, Select, Sheet, Switch, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { AUTO_PRESETS, useAutoPrepareSetting, useUpdateShow, type AutoLevel, type AutoPreset, type Show } from '../api/shows';
import { LEVEL_OPTIONS } from '../queue/PrepareDialog';

const levelLabel = (l: AutoLevel) => (l === 'original' ? 'non simplifié' : l);

/** Carte en tête des abonnements : interrupteur général et rappel du fonctionnement. */
export function AutoPrepareCard({ enabled, shows }: { enabled: boolean; shows: Show[] }) {
  const setting = useAutoPrepareSetting();
  const active = shows.filter((s) => s.enabled && s.autoPrepare && s.sourceType === 'podcast');
  return <section className={cn(cardCls, 'mb-5 p-4', enabled && 'border-primary/25 bg-gradient-to-br from-primary-soft/70 to-card')}>
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-[18px]" /></span>
      <h2 className="m-0 flex-1 text-[15px] font-semibold leading-snug">Préparation automatique chaque matin</h2>
      <Switch checked={enabled} disabled={setting.isPending} onChange={(v) => setting.mutate(v)} label="Activer les préparations automatiques" />
    </div>
    <p className="mb-0 mt-2 text-[13px] leading-relaxed text-muted-foreground">
      {enabled
        ? `${active.length} émission${active.length > 1 ? 's' : ''} préparée${active.length > 1 ? 's' : ''} automatiquement : le dernier épisode est mis en file dès sa parution, puis l’Atelier le prépare et le publie.`
        : 'Coupé : aucune émission n’est préparée automatiquement. Tes réglages par émission sont conservés.'}
      {' '}La voix Deepgram reste limitée par ton plafond mensuel ; au-delà, l’Atelier passe sur Kokoro.
    </p>
    {setting.isError && <Notice tone="warning" className="mt-2">{setting.error.message}</Notice>}
  </section>;
}

/** Pastille d'une émission : réglage actuel, ouvre le volet. Podcasts uniquement. */
export function AutoPrepareChip({ show }: { show: Show }) {
  const [open, setOpen] = useState(false);
  if (show.sourceType !== 'podcast') return null;
  return <>
    <button type="button" onClick={() => setOpen(true)}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors active:scale-95',
        show.autoPrepare ? 'border-transparent bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
      <Sparkles className="size-3.5" />
      {show.autoPrepare ? `Auto · ${AUTO_PRESETS[show.autoPreset].label} · ${levelLabel(show.autoLevel)}` : 'Préparer automatiquement'}
    </button>
    {open && <AutoPrepareDialog show={show} onClose={() => setOpen(false)} />}
  </>;
}

function AutoPrepareDialog({ show, onClose }: { show: Show; onClose: () => void }) {
  const update = useUpdateShow();
  const [on, setOn] = useState(true);
  const [preset, setPreset] = useState<AutoPreset>(show.autoPreset);
  const [level, setLevel] = useState<AutoLevel>(show.autoLevel);
  const save = (autoPrepare: boolean) => update.mutate({ id: show.id, autoPrepare, autoPreset: preset, autoLevel: level }, { onSuccess: onClose });
  return <Sheet title="Préparation automatique" onClose={onClose} locked={update.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={update.isPending}>Annuler</Button>
    <Button disabled={update.isPending} onClick={() => save(on)}>Enregistrer</Button>
  </>}>
    <p className="m-0 text-[15px] font-semibold leading-snug">{show.title}</p>
    <div className="flex min-h-11 items-center gap-3">
      <span className="flex-1 text-sm">Préparer chaque nouvel épisode</span>
      <Switch checked={on} onChange={setOn} label="Préparer chaque nouvel épisode" />
    </div>
    <div role="radiogroup" aria-label="Version préparée" className={cn('flex flex-col gap-2 transition-opacity', !on && 'pointer-events-none opacity-45')}>
      {(Object.keys(AUTO_PRESETS) as AutoPreset[]).map((p) => {
        const sel = p === preset;
        return <button key={p} type="button" role="radio" aria-checked={sel} disabled={!on} onClick={() => setPreset(p)}
          className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
            sel ? 'border-primary bg-primary-soft/60' : 'border-border bg-background hover:bg-muted')}>
          <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', sel ? 'border-primary' : 'border-zinc-300')}>
            {sel && <span className="size-2.5 rounded-full bg-primary" />}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold">{AUTO_PRESETS[p].label}</span>
            <span className="text-xs text-muted-foreground">{AUTO_PRESETS[p].cost}</span>
          </span>
        </button>;
      })}
    </div>
    <Field label="Niveau d’anglais"><Select value={level} disabled={!on} options={LEVEL_OPTIONS} onChange={setLevel} /></Field>
    <p className="m-0 text-xs leading-relaxed text-muted-foreground">
      Seul le dernier épisode est préparé, une seule fois. Les coûts sont des estimations ; l’Atelier affiche le coût réel avant chaque génération.
    </p>
    {update.isError && <Notice tone="error">{update.error.message}</Notice>}
  </Sheet>;
}
