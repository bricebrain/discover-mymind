import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { validArticleUrl } from './articleUrl';
import type { ArticleFetchStatus, Draft, Note } from './store';

/**
 * Récupération du texte d'une note Article par l'Atelier : demandée automatiquement quand la note a un lien et pas
 * encore de texte, suivie jusqu'au résultat ; la note n'est remplie que si elle est toujours vide.
 */
export function ArticleFetch({ draft, synced, initial, onFilled }: {
  draft: Draft; synced: boolean; initial: ArticleFetchStatus | null; onFilled: (note: Note) => void;
}) {
  const [status, setStatus] = useState<ArticleFetchStatus | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const asked = useRef(false);
  const url = (draft.sourceUrl ?? '').trim();
  const eligible = draft.origin === 'article' && !!url && validArticleUrl(url) && !draft.body.trim();

  const ask = () => {
    asked.current = true;
    setError(null);
    setSince(Date.now());
    api<{ articleFetch: ArticleFetchStatus }>(`/api/reflections/${draft.id}/fetch`, { method: 'POST' })
      .then((r) => setStatus(r.articleFetch))
      .catch((e: Error) => setError(e.message));
  };
  // Une seule demande automatique par ouverture, une fois la note (et son lien) enregistrée sur le serveur.
  useEffect(() => {
    if (eligible && synced && !asked.current && (status === null || status === 'skipped')) ask();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useQuery({
    queryKey: ['article-fetch', draft.id], enabled: status === 'pending', refetchInterval: 4000,
    queryFn: () => api<{ reflection: Note }>(`/api/reflections/${draft.id}`).then((r) => r.reflection),
  });
  useEffect(() => {
    const note = poll.data;
    if (!note || !note.articleFetch || note.articleFetch === 'pending') return;
    setStatus(note.articleFetch);
    if (note.articleFetch === 'complete' || note.articleFetch === 'partial') onFilled(note);
  }, [poll.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (draft.origin !== 'article' || !url) return null;
  if (status === 'pending') {
    const slow = Date.now() - since > 45_000;
    return <div role="status" className="flex flex-col gap-1.5">
      <p className="m-0 text-sm text-muted-foreground">Récupération du texte de l’article par l’Atelier…</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
      {slow && <p className="m-0 text-xs text-muted-foreground">Toujours en attente : l’Atelier doit être lancé sur le Mac. Tu peux aussi coller le texte toi-même.</p>}
    </div>;
  }
  if (status === 'complete' && draft.body.trim()) return <Notice tone="success">Texte récupéré depuis le site. Vérifie-le avant de le préparer.</Notice>;
  if (status === 'partial') return <Notice tone="warning">
    Article partiel : réservé aux abonnés ou tronqué. Ouvre l’article dans ton navigateur et colle la suite ici.
  </Notice>;
  if ((status === 'unavailable' || error) && !draft.body.trim()) return <Notice tone="warning"
    action={<Button size="sm" variant="ghost" onClick={ask}>Réessayer</Button>}>
    {error ?? 'Texte inaccessible depuis le lien.'} Ouvre l’article, copie son texte et colle-le ci-dessous : il sera nettoyé automatiquement.
  </Notice>;
  if (eligible && !synced) return <p className="m-0 text-xs text-muted-foreground">Le texte sera récupéré depuis le lien dès que la note sera synchronisée.</p>;
  return null;
}
