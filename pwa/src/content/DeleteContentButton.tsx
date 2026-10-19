import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/kit';
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
      <Button variant="ghost" size="icon" title="Supprimer les versions préparées" aria-label={`Supprimer les versions préparées de ${title}`}
        className="text-muted-foreground" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>
        <Trash2 className="size-[18px]" />
      </Button>
    ) : (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />Supprimer les versions préparées
      </Button>
    )}
    {open && <ConfirmSheet title="Supprimer les versions préparées ?" confirm={remove.isPending ? 'Suppression…' : 'Supprimer'}
      busy={remove.isPending} error={remove.error?.message} onConfirm={() => remove.mutate()} onClose={() => setOpen(false)}>
      <p className="m-0 text-[15px] font-semibold">{title}</p>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">
        Les versions en anglais, leur audio et leur transcription seront effacés. L’épisode ou la note d’origine restent : tu pourras les préparer à nouveau.
      </p>
    </ConfirmSheet>}
  </>;
}
