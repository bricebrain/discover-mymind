/** Enveloppe sans bouton englobant : conserve les liens/boutons de la carte hors sélection. */
import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { useSelection } from './useSelection';
import type { SelectionRef } from './model';
export function SelectableCard({ item, children }: { item: SelectionRef; children: ReactNode }) {
  const selection = useSelection();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, []);
  const checked = selection.contains(item);
  function start() {
    selection.start(item);
    if (typeof navigator.vibrate === 'function') navigator.vibrate(20);
  }
  return <div className={selection.active ? "group/selection relative pl-12" : "group/selection relative"} onPointerDown={(e) => {
    const control = (e.target as HTMLElement).closest('button, input, select, textarea');
    if (selection.active || e.button !== 0 || (control && !control.hasAttribute('data-selection-surface'))) return;
    held.current = false; origin.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => { held.current = true; start(); }, 500);
  }} onPointerMove={(e) => { if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancel(); }}
    onPointerUp={cancel} onPointerCancel={cancel} onContextMenu={(e) => { if (held.current || selection.active) e.preventDefault(); }}
    onClickCapture={(e) => {
      if (held.current) { e.preventDefault(); e.stopPropagation(); held.current = false; }
      else if (selection.active && !(e.target as HTMLElement).closest('[data-selection-control]')) {
        e.preventDefault(); e.stopPropagation(); selection.toggle(item);
      }
    }}>
    {children}
    <button type="button" data-selection-control aria-label={`Sélectionner ${item.title}`} aria-pressed={checked}
      className={`absolute left-0 top-2 flex size-11 items-center justify-center rounded-full border border-border bg-card shadow-sm ${selection.active ? "" : "pointer-events-none opacity-0 focus:pointer-events-auto focus:opacity-100"}`}
      onClick={() => selection.active ? selection.toggle(item) : start()}>
      <motion.span animate={{ scale: checked ? 1 : 0.8 }} className={checked ? 'text-primary' : 'text-muted-foreground'}>
        <Check aria-hidden className={`size-5 ${checked ? 'opacity-100' : 'opacity-30'}`} />
      </motion.span>
    </button>
  </div>;
}
