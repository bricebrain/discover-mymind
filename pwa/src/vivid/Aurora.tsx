import { cn } from '@/lib/utils';

/** Aurore animée : quatre taches de couleur floues qui dérivent lentement. Fond d'un conteneur `relative overflow-hidden`. */
export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const blob = (color: string, pos: string, delay: string) =>
    <span className={cn('aurora-blob', pos)} style={{ background: `var(${color})`, animationDelay: delay, opacity: 0.85 * intensity }} />;
  return <span aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
    {blob('--aurora-1', '-left-[15%] -top-[30%] size-[70%]', '0s')}
    {blob('--aurora-2', '-right-[10%] -top-[10%] size-[60%]', '-4s')}
    {blob('--aurora-3', '-bottom-[35%] left-[20%] size-[65%]', '-8s')}
    {blob('--aurora-4', '-bottom-[20%] -right-[20%] size-[55%]', '-11s')}
  </span>;
}
