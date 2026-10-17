import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { usePlayer } from '../player/PlayerProvider';

/** Supprime un contenu préparé (toutes ses versions) après confirmation. L'épisode ou la note d'origine restent. */
export function useDeleteContent(id: string, onDeleted?: () => void) {
  const qc = useQueryClient();
  const player = usePlayer();
  return useMutation({
    mutationFn: () => api<void>(`/api/contents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (player.track?.targetType === 'variant' && player.track.targetId.startsWith(`${id}:`)) player.stop();
      qc.removeQueries({ queryKey: ['content', id] });
      for (const key of ['library', 'episode', 'explorer', 'queue', 'reflections']) void qc.invalidateQueries({ queryKey: [key] });
      onDeleted?.();
    },
  });
}

export function DeleteContentButton({ id, title, compact = false, onDeleted }: { id: string; title: string; compact?: boolean; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteContent(id, () => { setOpen(false); onDeleted?.(); });
  return <>
    {compact ? (
      <Tooltip title="Supprimer les versions préparées">
        <IconButton aria-label={`Supprimer les versions préparées de ${title}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    ) : (
      <Button size="small" color="inherit" startIcon={<DeleteOutlineIcon />} onClick={() => setOpen(true)} sx={{ color: 'text.secondary' }}>
        Supprimer les versions préparées
      </Button>
    )}
    <Dialog open={open} onClose={remove.isPending ? undefined : () => setOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Supprimer les versions préparées ?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          Les versions en anglais, leur audio et leur transcription seront effacés. L’épisode ou la note d’origine restent : tu pourras les préparer à nouveau.
        </Typography>
        {remove.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{remove.error.message}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)} disabled={remove.isPending}>Annuler</Button>
        <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? 'Suppression…' : 'Supprimer'}</Button>
      </DialogActions>
    </Dialog>
  </>;
}
