import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Petits composants communs de la refonte (Tailwind + shadcn/ui + Motion) : volet du bas, messages, interrupteur, champs,
 * onglets en pastilles. Ils remplacent peu à peu Dialog, Alert, Switch, TextField et Tabs de MUI.
 */

export const cardCls = 'rounded-2xl border border-[#ececee] bg-card';
export const inputCls = 'h-11 w-full appearance-none rounded-xl border border-border bg-card px-3 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:opacity-50';

/** Volet du bas (vaul) : poignée, titre en Instrument Serif, contenu défilant et actions collées en bas. */
export function Sheet({ title, onClose, children, footer, locked = false, wide = false }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; locked?: boolean; wide?: boolean;
}) {
  return <Drawer.Root open onOpenChange={(o) => { if (!o && !locked) onClose(); }} dismissible={!locked} repositionInputs={false}>
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-[1300] bg-zinc-900/40" />
      <Drawer.Content aria-describedby={undefined}
        className={cn('fixed inset-x-0 bottom-0 z-[1300] mx-auto flex max-h-[92dvh] flex-col rounded-t-[28px] bg-card font-sans text-foreground outline-none',
          wide ? 'max-w-[720px]' : 'max-w-[560px]')}>
        <span className="mx-auto mt-2.5 h-[5px] w-10 shrink-0 rounded-full bg-zinc-300" aria-hidden />
        <Drawer.Title className="mx-5 mb-1 mt-3 font-display text-[1.75rem] leading-none">{title}</Drawer.Title>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 pt-3">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>;
}

/** Confirmation d'une action destructrice, dans un volet. */
export function ConfirmSheet({ title, children, confirm, busy, error, onConfirm, onClose }: {
  title: ReactNode; children?: ReactNode; confirm: string; busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void;
}) {
  return <Sheet title={title} onClose={onClose} locked={busy} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
    <Button className="bg-red-700 shadow-none hover:bg-red-800" onClick={onConfirm} disabled={busy}>{confirm}</Button>
  </>}>
    {children}
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}

const TONES = {
  info: { cls: 'bg-sky-50 text-sky-900 border-sky-200', Icon: Info },
  warning: { cls: 'bg-amber-50 text-amber-900 border-amber-200', Icon: AlertTriangle },
  error: { cls: 'bg-red-50 text-red-900 border-red-200', Icon: XCircle },
  success: { cls: 'bg-emerald-50 text-emerald-900 border-emerald-200', Icon: CheckCircle2 },
} as const;

export function Notice({ tone = 'info', children, action, className }: { tone?: keyof typeof TONES; children: ReactNode; action?: ReactNode; className?: string }) {
  const { cls, Icon } = TONES[tone];
  return <div role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
    className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-snug', cls, className)}>
    <Icon className="mt-px size-4 shrink-0" />
    <div className="min-w-0 flex-1">{children}</div>
    {action}
  </div>;
}

export function Spinner({ className, label = 'Chargement' }: { className?: string; label?: string }) {
  return <Loader2 role="status" aria-label={label} className={cn('size-5 animate-spin text-muted-foreground', className)} />;
}

/** Interrupteur accessible (role="switch") avec un curseur animé. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50',
      checked ? 'bg-primary' : 'bg-zinc-300')}>
    <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 36 }}
      className={cn('size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]', checked && 'ml-auto')} />
  </button>;
}

/** Champ avec étiquette au-dessus et aide ou erreur en dessous. */
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: boolean; children: ReactNode; className?: string }) {
  return <label className={cn('flex flex-col gap-1.5', className)}>
    <span className="text-[13px] font-semibold text-foreground">{label}</span>
    {children}
    {hint && <span className={cn('text-xs leading-snug', error ? 'text-red-700' : 'text-muted-foreground')}>{hint}</span>}
  </label>;
}

export function Select<T extends string>({ value, onChange, options, disabled, ...rest }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; disabled?: boolean; 'aria-label'?: string;
}) {
  return <span className="relative block">
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} className={cn(inputCls, 'pr-9')} {...rest}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  </span>;
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" />
    <span>{label}</span>
  </label>;
}

/** Onglets en pastilles défilantes ; la pastille sombre glisse vers l'onglet actif. */
export function PillTabs<T extends string>({ value, onChange, options, label, id }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; label: string; id: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  // L'onglet actif reste visible même s'il est loin à droite (ouverture directe par un lien ?view=…).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && list.current) list.current.scrollTo({ left: el.offsetLeft - list.current.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [value]);
  return <div ref={list} role="tablist" aria-label={label} className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {options.map(([v, l]) => {
      const on = v === value;
      return <button key={v} type="button" role="tab" aria-selected={on} onClick={() => onChange(v)}
        className={cn('relative flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors active:scale-95',
          on ? 'border-transparent text-background' : 'border-border bg-card text-foreground hover:bg-muted')}>
        {on && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
        <span className="relative">{l}</span>
      </button>;
    })}
  </div>;
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return <div className={cn('mb-2 mt-7 flex items-center gap-2', className)}>
    <h2 className="m-0 flex-1 font-display text-[1.6rem] font-normal leading-tight">{children}</h2>
    {aside}
  </div>;
}

export const mutedText = 'text-sm leading-relaxed text-muted-foreground';
