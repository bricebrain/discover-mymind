import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Episode } from '../api/episodes';
import { defaultOptions, optionsLabel, queueLabel } from './options';
import { PrepareDialog } from './PrepareDialog';
import { usePreparation } from './usePreparation';

export function PreparationPanel({episode}: {episode?: Episode}) {
  const {query,cancel,retry,remove} = usePreparation(episode ? {kind:'episode',id:episode.id} : undefined);
  const [open,setOpen] = useState(false);
  const items = query.data?.items ?? [];
  const active = items.some((i) => i.status==='pending' || i.status==='leased');
  const current = items.find((i) => i.status==='pending' || i.status==='leased') ?? items[0];
  // Dans le détail d'un épisode, une préparation terminée se voit déjà dans ses versions : seules les actives ou en échec s'affichent.
  const shown = episode ? (current && current.status!=='done' && current.status!=='cancelled' ? [current] : [])
    : items.filter((i) => i.status!=='cancelled').slice(0,20);
  return <Box sx={{my:2}}>
    {!episode && <Typography variant="h5" component="h2" sx={{mb:1}}>File de préparation</Typography>}
    {query.isPending && <CircularProgress size={20} aria-label="Chargement des préparations" />}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {episode && <Button startIcon={<AutoAwesomeOutlinedIcon />} variant="outlined" disabled={active || query.isPending || query.isError} onClick={() => setOpen(true)}>{episode.contentId ? 'Préparer une autre version' : 'Préparer en anglais'}</Button>}
    {!episode && query.isSuccess && !shown.length && <Typography variant="body2" color="text.secondary">Ajoute un lien YouTube, ou choisis « Préparer en anglais » sur un épisode ou une note My Mind.</Typography>}
    <Stack spacing={1} sx={{mt:1}}>{shown.map((item) => <Box key={item.id} sx={{p:1.5,border:1,borderColor:'divider',borderRadius:2}}>
      {!episode && <Typography variant="body2" sx={{fontWeight:600}}>{item.title}</Typography>}
      {!episode && <Typography variant="caption" color="text.secondary">{{ episode: 'Podcast', youtube: 'YouTube', reflection: 'My Mind' }[item.kind]}</Typography>}
      <Typography variant="body2">{queueLabel(item)}</Typography>
      <Typography variant="caption" color="text.secondary">{optionsLabel(item.options)}</Typography>
      {item.error && item.status==='failed' && <Typography variant="body2" color="error">{item.error}</Typography>}
      <Stack direction="row" spacing={1}>
        {!episode && item.kind==='episode' && <Button size="small" component={Link} to={`/?e=${item.ref}`}>Voir l’épisode</Button>}
        {!episode && item.kind==='reflection' && <Button size="small" component={Link} to={`/mind?n=${item.ref}`}>Voir la note</Button>}
        {!episode && item.kind==='youtube' && <Button size="small" href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.ref)}`} target="_blank" rel="noreferrer">Voir la vidéo</Button>}
        {['pending','leased'].includes(item.status) && <Button size="small" disabled={cancel.isPending} onClick={() => cancel.mutate(item.id)}>Annuler</Button>}
        {item.status==='failed' && <Button size="small" disabled={retry.isPending || items.some((i) => i.ref===item.ref && (i.status==='pending' || i.status==='leased'))} onClick={() => retry.mutate(item.id)}>Réessayer</Button>}
        {!episode && ['done','failed','cancelled'].includes(item.status) && <Button size="small" color="inherit" sx={{color:'text.secondary'}} disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Retirer de la liste</Button>}
        {item.status==='done' && item.contentId && <Button size="small" component={Link} to={item.kind==='episode' ? `/?e=${item.ref}` : `/library/${item.contentId}`}>Écouter les versions</Button>}
      </Stack>
    </Box>)}</Stack>
    {(cancel.isError || retry.isError || remove.isError) && <Alert severity="error">{cancel.error?.message ?? retry.error?.message ?? remove.error?.message}</Alert>}
    {open && episode && <PrepareDialog key={episode.id} target={{kind:'episode',id:episode.id}} title={episode.title}
      initial={defaultOptions(episode.durationSec,episode.showId)} faithfulAllowed={episode.language==='fr'} onClose={() => setOpen(false)} />}
  </Box>;
}
