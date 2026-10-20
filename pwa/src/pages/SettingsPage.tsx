import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, LogOut, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, SectionTitle, Spinner, cardCls } from '@/components/ui/kit';
import { ThemePicker } from '../vivid/ThemePicker';
import { cn } from '@/lib/utils';
import { useLogout, useRevokeOthers, useRevokeSession, useSession, useSessions } from '../api/auth';
import { NotificationSettings } from '../notifications/NotificationSettings';
import { ExportSection } from '../settings/ExportSection';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function SettingsPage() {
  const auth = useSession();
  return <div className="mx-auto max-w-[720px] px-4 pb-8 pt-1">
    <h1 className="sr-only">Réglages</h1>
    <SectionTitle className="mt-4">Apparence</SectionTitle>
    <ThemePicker />
    <p className="mb-0 mt-2 text-xs text-muted-foreground">Enregistré sur cet appareil. Le bouton soleil / lune de la barre du haut bascule aussi en un geste.</p>
    <section aria-label="Bilan hebdomadaire" className="mt-4">
      <Button asChild variant="outline" className="w-full justify-start">
        <Link to="/week" className="no-underline"><CalendarDays className="size-4" />Ma semaine</Link>
      </Button>
    </section>
    <section aria-label="Vocabulaire" className="mt-3"><Button asChild variant="outline" className="w-full justify-start">
      <Link to="/vocabulary" className="no-underline"><BookOpen className="size-4" />Mots gardés</Link>
    </Button></section>
    {auth.data?.authDisabled ? <>
      <SectionTitle className="mt-4">Connexion</SectionTitle>
      <Notice>La connexion est désactivée pour l’instant : l’app s’ouvre sans phrase secrète. Elle pourra être réactivée plus tard, sans rien perdre.</Notice>
    </> : <DevicesSettings />}
    <NotificationSettings />
    <ExportSection />
  </div>;
}

function DevicesSettings() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOthers();
  const logout = useLogout();
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;
  // L'appareil courant d'abord, puis les autres du plus récent au plus ancien.
  const ordered = sessions.data ? [...sessions.data].sort((a, b) => Number(b.current) - Number(a.current)) : [];

  return <section>
    <SectionTitle className="mt-4">Appareils connectés</SectionTitle>
    <p className="mb-3 mt-0 text-sm leading-relaxed text-muted-foreground">Chaque appareil a sa propre session. Révoque celles que tu ne reconnais pas.</p>
    <div className={cn(cardCls, 'divide-y divide-border/70 overflow-hidden')}>
      {sessions.isPending && <div className="grid place-items-center p-5"><Spinner /></div>}
      {sessions.isError && <Notice tone="error" className="m-3">Impossible de charger les sessions.</Notice>}
      {ordered.map((s) => <div key={s.id} className="flex items-center gap-3 p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><Smartphone className="size-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="truncate">{s.label ?? 'Appareil'}</span>
            {s.current && <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">Cet appareil</span>}
          </span>
          <span className="block text-xs text-muted-foreground">Ouverte le {formatDate(s.createdAt)} · vue le {formatDate(s.lastSeenAt)}</span>
        </span>
        {!s.current && <Button variant="ghost" size="sm" className="text-red-700" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>Révoquer</Button>}
      </div>)}
    </div>
    <div className="mt-3 flex flex-col gap-2">
      <Button variant="outline" className="text-red-700" disabled={others === 0 || revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
        Déconnecter les autres appareils{others > 0 ? ` (${others})` : ''}
      </Button>
      <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut className="size-4" />Se déconnecter de cet appareil</Button>
    </div>
  </section>;
}
