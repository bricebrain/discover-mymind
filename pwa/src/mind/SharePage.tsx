import { Spinner } from '@/components/ui/kit';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sharedToNote } from './share';
import { newDraft, putDraft } from './store';

/** Cible de « Partager vers Discover » (Web Share Target) : crée la note puis l'ouvre dans My Mind. */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true; // une seule note, même si l'effet est rejoué (StrictMode)
    const shared = sharedToNote({ title: params.get('title'), text: params.get('text'), url: params.get('url') });
    const draft = { ...newDraft(), ...shared };
    void putDraft(draft).then(() => navigate(`/mind?n=${draft.id}`, { replace: true }));
  }, [params, navigate]);
  return <div className="grid place-items-center gap-3 p-10 text-center">
    <Spinner />
    <p className="m-0 text-muted-foreground">Création de la note…</p>
  </div>;
}
