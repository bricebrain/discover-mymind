import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, SectionTitle } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { useNotifications } from './useNotifications';
import { usePreparationLive } from './PreparationEventsProvider';

export function NotificationSettings() {
  const n = useNotifications(); const live = usePreparationLive(); const busy = n.enable.isPending || n.disable.isPending;
  return <section>
    <SectionTitle aside={<span className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
      live ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground')}>
      <span className={cn('size-1.5 rounded-full', live ? 'animate-pulse bg-emerald-600' : 'bg-zinc-400')} />{live ? 'Suivi en direct' : 'Suivi périodique'}
    </span>}>Notifications</SectionTitle>
    <p className="mb-3 mt-0 text-sm leading-relaxed text-muted-foreground">Reçois une notification quand une préparation est prête, attend ta relecture ou a échoué, même lorsque Discover est fermé. Le titre de l’épisode reste privé.</p>
    <div className="flex flex-col gap-2">
      {!n.supported && <Notice>Les notifications ne sont pas disponibles dans ce navigateur. Essaie Chrome sur ton téléphone.</Notice>}
      {n.config.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void n.config.refetch()}>Réessayer</Button>}>Impossible de charger les réglages des notifications.</Notice>}
      {n.supported && n.config.data && !n.config.data.configured && <Notice>Les notifications ne sont pas encore disponibles sur le serveur.</Notice>}
      {n.supported && n.permission === 'denied' && <Notice>Les notifications sont bloquées. Autorise-les dans les réglages du navigateur pour Discover.</Notice>}
      {n.supported && n.config.data?.configured && <div className="flex flex-wrap gap-2">
        <Button variant={n.config.data.enabled ? 'outline' : 'default'} disabled={busy || (n.permission === 'denied' && !n.config.data.enabled)}
          onClick={() => n.config.data?.enabled ? n.disable.mutate() : n.enable.mutate()}>
          <Bell className="size-4" />{busy ? 'Mise à jour…' : n.config.data.enabled ? 'Désactiver sur cet appareil' : 'Activer sur cet appareil'}
        </Button>
        {n.active && <Button variant="ghost" disabled={n.test.isPending} onClick={() => n.test.mutate()}>Envoyer un test</Button>}
      </div>}
      {n.error && <Notice tone="warning">{n.error.message}</Notice>}
      {n.test.isSuccess && <Notice tone="success">Notification de test demandée. Vérifie sa réception sur cet appareil.</Notice>}
    </div>
  </section>;
}
