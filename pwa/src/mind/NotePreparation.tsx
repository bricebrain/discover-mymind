import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { PreparedEpisode } from '../components/PreparedEpisode';
import { optionsLabel, queueLabel } from '../queue/options';
import { PrepareDialog } from '../queue/PrepareDialog';
import { usePreparation } from '../queue/usePreparation';

const MIN_CHARS = 20;

/**
 * « Préparer en anglais » sur une note : l'Atelier traduit / adapte le texte à ton niveau, en lit une
 * version audio, puis la publie. Les versions s'écoutent ici, sous la note, sans changer de page.
 */
export function NotePreparation({ id, title, body, synced, englishContentId }: {
  id: string; title: string; body: string; synced: boolean; englishContentId: string | null;
}) {
  const { query, cancel, retry } = usePreparation({ kind: 'reflection', id });
  const [open, setOpen] = useState(false);
  const items = query.data?.items ?? [];
  const current = items.find((i) => i.status === 'pending' || i.status === 'leased');
  const failed = !current && items[0]?.status === 'failed' ? items[0] : undefined;
  const contentId = items.find((i) => i.status === 'done' && i.contentId)?.contentId ?? englishContentId;
  const tooShort = body.trim().length < MIN_CHARS;

  return (
    <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>En anglais</Typography>
        <Button size="small" variant="outlined" startIcon={<AutoAwesomeOutlinedIcon />}
          disabled={!!current || tooShort || !synced || query.isPending} onClick={() => setOpen(true)}>
          {contentId ? 'Préparer une autre version' : 'Préparer en anglais'}
        </Button>
      </Stack>
      {(tooShort || !synced) && !contentId && (
        <Typography variant="caption" color="text.secondary">
          {tooShort ? `Écris au moins ${MIN_CHARS} caractères pour pouvoir préparer la note.` : 'La note doit être synchronisée avant d’être préparée.'}
        </Typography>
      )}
      {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
      {(current ?? failed) && (
        <Box sx={{ p: 1.5, mb: 2, border: 1, borderColor: 'divider', borderRadius: 2 }} role="status">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{queueLabel((current ?? failed)!)}</Typography>
          <Typography variant="caption" color="text.secondary">{optionsLabel((current ?? failed)!.options)}</Typography>
          {failed?.error && <Typography variant="body2" color="error">{failed.error}</Typography>}
          <Stack direction="row" spacing={1}>
            {current && <Button size="small" disabled={cancel.isPending} onClick={() => cancel.mutate(current.id)}>Annuler</Button>}
            {failed && <Button size="small" disabled={retry.isPending} onClick={() => retry.mutate(failed.id)}>Réessayer</Button>}
          </Stack>
        </Box>
      )}
      {contentId && <PreparedEpisode contentId={contentId} about={null} />}
      {open && (
        <PrepareDialog target={{ kind: 'reflection', id }} title={title || 'Note sans titre'} faithfulAllowed
          initial={{ coverage: 'full', level: 'B1', style: 'narration', targetMinutes: null, faithful: false, keepOriginalCopy: false }}
          onClose={() => setOpen(false)} />
      )}
    </Box>
  );
}
