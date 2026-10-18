import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { PrepareDialog } from './PrepareDialog';
import { youtubeVideoId } from './youtube';

export function AddYoutubeDialog({ onClose, onQueued }: { onClose: () => void; onQueued: () => void }) {
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState<string | null>(null);
  const id = youtubeVideoId(url);
  if (video) return <PrepareDialog target={{ kind: 'youtube', id: video }} title="Vidéo YouTube" faithfulAllowed={false}
    initial={{ coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 12, faithful: false, keepOriginalCopy: false }}
    onQueued={onQueued} onClose={onClose} />;
  return <Dialog open onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>Ajouter un lien YouTube</DialogTitle>
    <form onSubmit={(event) => { event.preventDefault(); if (id) setVideo(id); }}>
      <DialogContent><Stack spacing={2}>
        <TextField autoFocus fullWidth label="Lien de la vidéo" type="url" value={url} onChange={(event) => setUrl(event.target.value)}
          error={!!url.trim() && !id} helperText={url.trim() && !id ? 'Colle un lien vers une vidéo YouTube ou un Short.' : 'Liens youtube.com et youtu.be acceptés.'} />
        <Typography variant="body2" color="text.secondary">Choisis ensuite la version et ton niveau d’anglais. L’Atelier sur le Mac récupère la vidéo et prépare le texte et l’audio.</Typography>
      </Stack></DialogContent>
      <DialogActions><Button onClick={onClose}>Annuler</Button><Button variant="contained" type="submit" disabled={!id}>Continuer</Button></DialogActions>
    </form>
  </Dialog>;
}
