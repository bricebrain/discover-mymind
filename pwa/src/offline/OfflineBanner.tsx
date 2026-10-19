import { CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

/** Bandeau discret hors ligne, avec un accès direct aux téléchargements. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return <div role="status" className="flex items-center gap-2 border-t border-border/70 bg-muted px-4 py-1.5 text-sm">
    <CloudOff className="size-4 shrink-0 text-muted-foreground" />
    <span className="flex-1">Hors ligne : les versions téléchargées restent disponibles.</span>
    <Link to="/library?view=downloads" className="shrink-0 font-semibold text-primary no-underline">Téléchargements</Link>
  </div>;
}
