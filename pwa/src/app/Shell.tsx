import { BookOpen, Compass, Lightbulb, Radio, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SelectionScope } from '../selection/SelectionScope';
import { MiniPlayer } from '../player/MiniPlayer';
import { OfflineBanner } from '../offline/OfflineBanner';

export const TABS = [
  { path: '/', label: 'Explorer', icon: Compass },
  { path: '/library', label: 'Bibliothèque', icon: BookOpen },
  { path: '/mind', label: 'My Mind', icon: Lightbulb },
] as const;

/** Hauteurs fixes du cadre, utilisées par les mises en page en deux colonnes. */
export const APP_BAR_H = 52;
export const NAV_H = 64;

/**
 * Cadre de l'app (refonte Tailwind + shadcn/ui + Motion) : barre du haut translucide, contenu animé à chaque écran,
 * mini-lecteur flottant et navigation du bas avec une pastille qui glisse vers l'onglet actif.
 */
export function Shell() {
  const { pathname } = useLocation();
  const active = TABS.findIndex((t) => (t.path === '/' ? pathname === '/' : pathname.startsWith(t.path)));
  // Titre de l'écran dans la barre du haut (les écrans de détail gardent « Discover » et leur propre titre).
  const title = pathname === '/' ? 'Explorer' : pathname.startsWith('/mind') ? 'My Mind' : pathname === '/library' ? 'Bibliothèque'
    : pathname === '/shows' ? 'Abonnements' : pathname === '/settings' ? 'Réglages' : pathname === '/week' ? 'Ma semaine' : pathname === '/vocabulary' ? 'Mots gardés' : 'Discover';

  return (
    <SelectionScope><div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-[1100] border-b border-border/70 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-[52px] items-center gap-2 px-4">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 text-foreground no-underline">
            <img src="/icons/icon.svg" alt="" className="size-[26px] shrink-0 rounded-md" />
            <span className="truncate font-display text-[1.75rem] leading-none tracking-tight">{title}</span>
          </Link>
          {pathname === '/' && <Link to="/shows" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground no-underline active:scale-95">
            <Radio className="size-4 text-primary" />Abonnements
          </Link>}
          <Link to="/settings" aria-label="Réglages" aria-current={pathname === '/settings' ? 'page' : undefined}
            className={cn('-mr-2 grid size-11 place-items-center rounded-full transition-colors hover:bg-muted active:scale-95',
              pathname === '/settings' ? 'text-primary' : 'text-foreground')}>
            <Settings className="size-5" strokeWidth={2} />
          </Link>
        </div>
        <OfflineBanner />
      </header>

      <main className="flex-1" style={{ paddingBottom: `calc(${NAV_H}px + var(--player-h, 0px) + env(safe-area-inset-bottom))` }}>
        {/* Entrée douce à chaque écran ; pas d'animation de sortie (l'ancien écran disparaît aussitôt, sans flash). */}
        <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
          <Outlet />
        </motion.div>
      </main>

      <nav aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-[1100] border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
        <MiniPlayer />
        <div className="mx-auto grid h-16 max-w-[760px] grid-cols-3">
          {TABS.map((t, i) => {
            const on = i === active;
            const Icon = t.icon;
            return (
              <NavLink key={t.path} to={t.path} end={t.path === '/'} aria-current={on ? 'page' : undefined}
                className={cn('flex flex-col items-center justify-center gap-1 text-xs no-underline transition-colors active:scale-95',
                  on ? 'font-semibold text-primary' : 'font-medium text-muted-foreground')}>
                <span className="relative grid h-7 w-14 place-items-center">
                  {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-primary-soft"
                    transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                  <Icon className="relative size-[22px]" strokeWidth={on ? 2.2 : 1.9} />
                </span>
                {t.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div></SelectionScope>
  );
}
