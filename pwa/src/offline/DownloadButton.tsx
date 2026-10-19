import { CloudCheck, Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/kit';
import type { ContentDetail, ContentVariant } from '../api/contents';
import { usePlayer } from '../player/PlayerProvider';
import { downloadable, formatBytes, offline, removeDownload, startDownload, useDownload } from './index';

/** Téléchargement explicite de la version affichée : progression, annulation, état, mise à jour et suppression. */
export function DownloadButton({ detail, variant }: { detail: ContentDetail; variant: ContentVariant }) {
  const state = useDownload(detail, variant);
  const player = usePlayer();
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const { key, record, active, outdated } = state;
  const start = () => {
    setError(null);
    startDownload(detail, variant).catch((e: Error) => setError(e.message));
  };

  if (!downloadable(variant)) {
    return <p className="m-0 mt-2 text-xs text-muted-foreground">Diffusée par l’éditeur : cette version n’est pas téléchargeable.</p>;
  }
  if (active) {
    const pct = active.total ? Math.round((active.received / active.total) * 100) : null;
    return <div className="mt-3" role="status">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm">Téléchargement… {pct !== null ? `${pct} %` : ''} {active.received ? `· ${formatBytes(active.received)}` : ''}</span>
        <Button size="sm" variant="ghost" onClick={() => offline.cancel(key)}>Annuler</Button>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={pct === null ? 'h-full w-1/3 animate-pulse bg-primary' : 'h-full bg-primary transition-[width]'} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
    </div>;
  }
  return <div className="mt-3">
    {record?.status === 'complete' ? <div className="flex flex-wrap items-center gap-2">
      <CloudCheck className={outdated ? 'size-4 text-amber-700' : 'size-4 text-emerald-700'} />
      <span className="flex-1 text-sm">{outdated ? 'Téléchargée depuis une ancienne publication' : 'Disponible hors ligne'} · {formatBytes(record.audioBytes + record.textBytes)}</span>
      {outdated && <Button size="sm" variant="ghost" className="text-primary" onClick={start}>Mettre à jour</Button>}
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void removeDownload(key, player)}>Supprimer le téléchargement</Button>
    </div> : <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={start}><Download className="size-4" />
        {record && record.status !== 'downloading' ? 'Réessayer le téléchargement' : 'Télécharger pour l’écoute hors ligne'}</Button>
      {variant.audio && <span className="text-xs text-muted-foreground">Audio et transcription de cette version</span>}
    </div>}
    {(error || (record && record.status !== 'complete' && record.error)) && <Notice tone="warning" className="mt-2">{error ?? record?.error}</Notice>}
  </div>;
}
