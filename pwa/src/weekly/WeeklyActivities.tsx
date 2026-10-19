import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice, SectionTitle, cardCls } from '@/components/ui/kit';
import { formatNumber, listeningLink } from './helpers';
import type { WeeklyActivities as Activities } from './types';

interface Item { key: string; title: string; to: string | null; detail?: string }
function ActivityList({ title, items, available }: { title: string; items: Item[]; available: boolean }) {
  return <section>
    <SectionTitle>{title}</SectionTitle>
    {!available ? <p className="text-sm text-muted-foreground">Détail indisponible dans le bilan actuel.</p>
      : !items.length ? <p className="text-sm text-muted-foreground">Aucune activité cette semaine.</p>
      : <ul className={`${cardCls} divide-y divide-border/70 overflow-hidden`}>
        {items.map(item => <li key={item.key}>
          {item.to ? <Link to={item.to} className="flex min-h-11 items-center gap-3 p-3 text-foreground no-underline hover:bg-muted focus-visible:outline-primary">
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.title || 'Sans titre'}</span>
              {item.detail && <span className="text-xs text-muted-foreground">{item.detail}</span>}
            </span><ChevronRight className="size-4 shrink-0" />
          </Link> : <p className="p-3 text-sm">{item.title || 'Sans titre'} · lien indisponible</p>}
        </li>)}
      </ul>}
  </section>;
}

export function WeeklyActivities({ activities }: { activities?: Activities }) {
  return <>
    {!activities && <Notice className="mt-5">Les chiffres et l’export sont disponibles. Les listes avec liens dans l’app nécessitent un complément de l’API du bilan.</Notice>}
    <ActivityList title="Écoutes" available={Boolean(activities)} items={(activities?.listening ?? []).map(item => ({
      key: `${item.targetType}:${item.targetId}`, title: item.title, to: listeningLink(item.targetType, item.targetId),
      detail: `${formatNumber(item.listenedMs / 60_000)} min${item.completed ? ' · terminé' : ''}`,
    }))} />
    <ActivityList title="Notes" available={Boolean(activities)} items={(activities?.notes ?? []).map(item => ({
      key: item.id, title: item.title, to: `/mind?n=${encodeURIComponent(item.id)}`,
    }))} />
    <ActivityList title="Articles" available={Boolean(activities)} items={(activities?.articles ?? []).map(item => ({
      key: item.id, title: item.title, to: `/?a=${encodeURIComponent(item.id)}`,
      detail: [item.wasRead ? 'Lu' : '', item.wasSaved ? 'Enregistré' : ''].filter(Boolean).join(' · '),
    }))} />
    <ActivityList title="Publications" available={Boolean(activities)} items={(activities?.publications ?? []).map(item => ({
      key: item.id, title: item.title, to: `/library/${encodeURIComponent(item.contentId)}`,
    }))} />
  </>;
}
