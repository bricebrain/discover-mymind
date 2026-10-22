import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, Select, Sheet, Switch, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useAutoPrepareSetting, useUpdateShow, type AutoLevel, type Show } from '../api/shows';
import { EXPLANATION_LEVEL_OPTIONS } from '../queue/options';

const levelLabel = (l: AutoLevel) => (l === 'original' ? 'C1' : l);

/** Carte en tête des abonnements : interrupteur général et rappel du fonctionnement. */
export function AutoPrepareCard({ enabled, shows }: { enabled: boolean; shows: Show[] }) {
  const setting = useAutoPrepareSetting();
  const active = shows.filter((s) => s.enabled && s.autoPrepare);
  return <section className={cn(cardCls, 'mb-5 p-4', enabled && 'border-primary/25 bg-gradient-to-br from-primary-soft/70 to-card')}>
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-[18px]" /></span>
      <h2 className="m-0 flex-1 text-[15px] font-semibold leading-snug">Préparation automatique chaque matin</h2>
      <Switch checked={enabled} disabled={setting.isPending} onChange={(v) => setting.mutate(v)} label="Activer les préparations automatiques" />
    </div>
    <p className="mb-0 mt-2 text-[13px] leading-relaxed text-muted-foreground">
      {enabled
        ? `${active.length} chaîne${active.length > 1 ? 's' : ''} préparée${active.length > 1 ? 's' : ''} automatiquement : la dernière vidéo est mise en file dès sa parution, puis l’Atelier la prépare et la publie.`
        : 'Coupé : aucune chaîne n’est préparée automatiquement. Tes réglages par chaîne sont conservés.'}
      {' '}La formule est Original guidé, avec Kokoro par défaut : une voix gratuite et locale.
    </p>
    {setting.isError && <Notice tone="warning" className="mt-2">{setting.error.message}</Notice>}
  </section>;
}

/** Pastille d'une chaîne : réglage actuel, ouvre le volet. */
export function AutoPrepareChip({ show }: { show: Show }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors active:scale-95',
        show.autoPrepare ? 'border-transparent bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
      <Sparkles className="size-3.5" />
      {show.autoPrepare ? `Auto · Original guidé · explications ${levelLabel(show.autoLevel)}` : 'Préparer automatiquement'}
    </button>
    {open && <AutoPrepareDialog show={show} onClose={() => setOpen(false)} />}
  </>;
}

function AutoPrepareDialog({ show, onClose }: { show: Show; onClose: () => void }) {
  const update = useUpdateShow();
  const [on, setOn] = useState(true);
  const [level, setLevel] = useState<AutoLevel>(show.autoLevel === 'original' ? 'C1' : show.autoLevel);
  const save = (autoPrepare: boolean) => update.mutate({ id: show.id, autoPrepare, autoLevel: level }, { onSuccess: onClose });
  return <Sheet title="Préparation automatique" onClose={onClose} locked={update.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={update.isPending}>Annuler</Button>
    <Button disabled={update.isPending} onClick={() => save(on)}>Enregistrer</Button>
  </>}>
    <p className="m-0 text-[15px] font-semibold leading-snug">{show.title}</p>
    <div className="flex min-h-11 items-center gap-3">
      <span className="flex-1 text-sm">Préparer chaque nouvelle vidéo</span>
      <Switch checked={on} onChange={setOn} label="Préparer chaque nouvelle vidéo" />
    </div>
    <Field label="Version préparée"><p className="m-0 text-sm font-semibold">Original guidé</p></Field>
    <Field label="Niveau des explications"><Select value={level} disabled={!on} options={EXPLANATION_LEVEL_OPTIONS} onChange={setLevel} /></Field>
    <p className="m-0 text-xs leading-relaxed text-muted-foreground">
      Seule la dernière vidéo est préparée, une seule fois. Le niveau règle les explications du guide.
    </p>
    {update.isError && <Notice tone="error">{update.error.message}</Notice>}
  </Sheet>;
}
