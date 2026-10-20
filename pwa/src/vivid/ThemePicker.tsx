import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTheme, type ThemePreference } from '../settings/theme';

const PREVIEW = { light: { bg: '#ffffff', card: '#f4f4f5', ink: '#18181b' }, dark: { bg: '#0d0e12', card: '#1f2027', ink: '#f1f1f4' } };

function Preview({ mode }: { mode: 'light' | 'dark' }) {
  const p = PREVIEW[mode];
  return <span className="relative block h-24 overflow-hidden rounded-[14px] border border-border" style={{ background: p.bg }}>
    <span className="absolute inset-x-2.5 top-2.5 h-9 rounded-[10px] bg-grad-primary" />
    <span className="absolute left-2.5 top-[52px] h-2 w-16 rounded-full opacity-80" style={{ background: p.ink }} />
    <span className="absolute left-2.5 right-2.5 top-[66px] h-5 rounded-[7px]" style={{ background: p.card }} />
  </span>;
}

/** Choix du thème par aperçus : Clair, Sombre, ou Automatique (suit le téléphone). */
export function ThemePicker() {
  const { preference, resolved, setTheme } = useTheme();
  const options: [ThemePreference, string][] = [['light', 'Clair'], ['dark', 'Sombre'], ['system', 'Automatique']];
  return <div role="radiogroup" aria-label="Thème de l’application" className="grid grid-cols-3 gap-2.5">
    {options.map(([value, label]) => {
      const on = preference === value;
      return <motion.button key={value} type="button" role="radio" aria-checked={on} whileTap={{ scale: 0.95 }} onClick={() => setTheme(value)}
        className={cn('flex flex-col gap-2 rounded-[18px] p-2 text-left transition-colors', on ? 'bg-primary-soft' : 'bg-muted')}>
        {value === 'system'
          ? <span className="relative block h-24 overflow-hidden rounded-[14px]">
              <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden"><span className="block w-[200%]"><Preview mode="light" /></span></span>
              <span className="absolute inset-y-0 right-0 w-1/2 overflow-hidden"><span className="-ml-[100%] block w-[200%]"><Preview mode="dark" /></span></span>
            </span>
          : <Preview mode={value} />}
        <span className="flex items-center justify-between px-1 pb-0.5">
          <span className={cn('text-[14px] font-semibold', on && 'text-primary')}>{label}</span>
          {on && <motion.span layoutId="theme-check" className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3} /></motion.span>}
        </span>
        {value === 'system' && on && <span className="px-1 text-[12px] text-muted-foreground">Actuellement {resolved === 'dark' ? 'sombre' : 'clair'}</span>}
      </motion.button>;
    })}
  </div>;
}
