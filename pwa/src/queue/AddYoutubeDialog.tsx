import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Sheet, inputCls } from '@/components/ui/kit';
import { PrepareDialog } from './PrepareDialog';
import { youtubeVideoId } from './youtube';

export function AddYoutubeDialog({ onClose, onQueued }: { onClose: () => void; onQueued: () => void }) {
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState<string | null>(null);
  const id = youtubeVideoId(url);
  if (video) return <PrepareDialog target={{ kind: 'youtube', id: video }} title="Vidéo YouTube" faithfulAllowed={false}
    initial={{ coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 12, faithful: false, keepOriginalCopy: false }}
    onQueued={onQueued} onClose={onClose} />;
  const bad = !!url.trim() && !id;
  return <Sheet title="Ajouter un lien YouTube" onClose={onClose} footer={<>
    <Button variant="ghost" onClick={onClose}>Annuler</Button>
    <Button type="submit" form="add-youtube" disabled={!id}>Continuer</Button>
  </>}>
    <form id="add-youtube" className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (id) setVideo(id); }}>
      <Field label="Lien de la vidéo" error={bad} hint={bad ? 'Colle un lien vers une vidéo YouTube ou un Short.' : 'Liens youtube.com et youtu.be acceptés.'}>
        <input autoFocus type="url" inputMode="url" className={inputCls} value={url} aria-invalid={bad} placeholder="https://youtu.be/…"
          onChange={(event) => setUrl(event.target.value)} />
      </Field>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">Choisis ensuite une préparation sur le Mac ou sans Mac, puis ton niveau d’anglais.</p>
    </form>
  </Sheet>;
}
