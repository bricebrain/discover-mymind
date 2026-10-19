import { Download, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConfirmSheet, Notice, cardCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { formatBytes, offline, removeDownload, useOffline } from './index';
import { usePlayer } from '../player/PlayerProvider';

const STATUS = { downloading: 'Téléchargement…', interrupted: 'Interrompu', failed: 'Échec', broken: 'Fichier absent' } as const;

/** Téléchargements de l'appareil : accessibles sans réseau, avec l'espace utilisé et la suppression locale. */
export function DownloadsList() {
  const { ready, records, active } = useOffline();
  const player = usePlayer();
  const [space, setSpace] = useState<{ downloads: number; usage: number | null; quota: number | null } | null>(null);
  const [clearing, setClearing] = useState(false);
  useEffect(() => { void offline.usage().then(setSpace); }, [records]);
  const total = records.reduce((s, r) => s + r.audioBytes + r.textBytes, 0);

  return <section className="pt-1">
    <p className="mb-3 mt-0 text-[13px] text-muted-foreground">
      {[records.length ? `${records.length} version${records.length > 1 ? 's' : ''} · ${formatBytes(total)} sur cet appareil` : '',
        space?.quota ? `espace libre estimé ${formatBytes(Math.max(0, space.quota - (space.usage ?? 0)))}` : ''].filter(Boolean).join(' · ')}
    </p>
    {ready && !records.length && <p className="text-sm leading-relaxed text-muted-foreground">
      Aucun téléchargement. Ouvre un contenu préparé et choisis « Télécharger pour l’écoute hors ligne » sous la version.
    </p>}
    <div className="flex flex-col gap-2">
      {records.map((r) => {
        const progress = active[r.key];
        const pct = progress?.total ? Math.round(progress.received / progress.total * 100) : null;
        const body = <>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Download className="size-[18px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{r.title}</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {r.label} · {r.status === 'complete' ? formatBytes(r.audioBytes + r.textBytes) : pct !== null ? `${STATUS.downloading} ${pct} %` : STATUS[r.status]}
            </span>
            {pct !== null && <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></span>}
            {r.status !== 'complete' && r.error && <span className="mt-0.5 block text-xs text-amber-700">{r.error}</span>}
          </span>
        </>;
        return <div key={r.key} className={cn(cardCls, 'flex items-center')}>
          {r.status === 'complete'
            ? <Link to={`/library/${r.contentId}?v=${encodeURIComponent(r.variantKey)}`} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-foreground no-underline active:opacity-70">{body}</Link>
            : <div className="flex min-w-0 flex-1 items-center gap-3 p-3">{body}</div>}
          <Button variant="ghost" size="icon" className="mr-1 text-muted-foreground" title="Supprimer le téléchargement"
            aria-label={`Supprimer le téléchargement de ${r.title}`} onClick={() => void removeDownload(r.key, player)}>
            <Trash2 className="size-[18px]" />
          </Button>
        </div>;
      })}
    </div>
    {records.length > 1 && <Button variant="ghost" size="sm" className="mt-3 text-muted-foreground" onClick={() => setClearing(true)}>Tout supprimer</Button>}
    {!navigator.onLine && <Notice className="mt-3">Hors ligne : seules les versions téléchargées s’ouvrent.</Notice>}
    {clearing && <ConfirmSheet title="Supprimer tous les téléchargements ?" confirm="Tout supprimer" onClose={() => setClearing(false)}
      onConfirm={() => { void Promise.all(records.map((r) => removeDownload(r.key, player))); setClearing(false); }}>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">Les versions restent dans Discover ; seules les copies de cet appareil sont effacées.</p>
    </ConfirmSheet>}
  </section>;
}
