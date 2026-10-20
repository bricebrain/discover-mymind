import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTheme } from '../settings/theme';

/** Bascule Clair ↔ Sombre en un geste (le choix « Automatique » est dans Réglages). Le soleil et la lune tournent l'un dans l'autre. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setTheme } = useTheme();
  const dark = resolved === 'dark';
  return <motion.button type="button" whileTap={{ scale: 0.86 }} aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
    title={dark ? 'Thème clair' : 'Thème sombre'}
    onClick={() => { navigator.vibrate?.(8); setTheme(dark ? 'light' : 'dark'); }}
    className={cn('relative grid size-10 place-items-center overflow-hidden rounded-full bg-muted text-foreground', className)}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={dark ? 'moon' : 'sun'} initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
        exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }} className="grid place-items-center">
        {dark ? <Moon className="size-[18px] fill-amber-300 text-amber-300" /> : <Sun className="size-[19px] text-amber-500" />}
      </motion.span>
    </AnimatePresence>
  </motion.button>;
}
