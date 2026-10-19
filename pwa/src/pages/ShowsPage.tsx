import { AddShowDialog } from '../shows/AddShowDialog';
import { AutoPrepareCard, AutoPrepareChip } from '../shows/AutoPrepare';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, List,
  ListItem, ListItemAvatar, ListItemText, Paper, Stack, Switch, Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { CATEGORY_LABELS, formatWhen, type Category } from '../api/episodes';
import { useDeleteShow, useShows, useUpdateShow, type Show } from '../api/shows';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Une erreur est survenue.');

function status(show: Show): string {
  if (!show.enabled) return 'En pause';
  if (show.lastError) return `Erreur : ${show.lastError}`;
  if (!show.lastSuccessAt) return 'Première vérification dans quelques minutes';
  const unit = show.sourceType === 'youtube' ? 'vidéo' : 'épisode';
  return `${show.episodeCount} ${unit}${show.episodeCount > 1 ? 's' : ''} · vérifiée ${formatWhen(show.lastSuccessAt)}`;
}

export function ShowsPage() {
  const shows = useShows();
  const update = useUpdateShow();
  const remove = useDeleteShow();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Show | null>(null);
  const count = shows.data?.shows.filter((s) => s.enabled).length ?? 0;
  const max = shows.data?.max ?? 50;

  return (
    <Box sx={{ px: 2, pt: 2, pb: 4, maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={Link} to="/" aria-label="Retour à Explorer" edge="start"><ArrowBackIcon /></IconButton>
        <Typography variant="h1" component="h1" sx={{ flex: 1, fontSize: { xs: '1.6rem', sm: '2.1rem' } }}>Mes abonnements</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={count >= max}>Ajouter</Button>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {count} / {max} sources actives. Vérification à tour de rôle, environ toutes les 30 à 60 minutes.
      </Typography>

      {shows.data && <AutoPrepareCard enabled={shows.data.autoPrepareEnabled} shows={shows.data.shows} />}
      {shows.isPending && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
      {(update.isError || remove.isError) && <Alert severity="warning">{errorText(update.error ?? remove.error)}</Alert>}
      {shows.isError && <Alert severity="warning">{errorText(shows.error)}</Alert>}

      {CATEGORIES.map((cat) => {
        const group = shows.data?.shows.filter((s) => s.category === cat) ?? [];
        if (group.length === 0) return null;
        return (
          <Box key={cat} sx={{ mb: 3 }}>
            <Typography variant="h3" component="h2" sx={{ mb: 1 }}>{CATEGORY_LABELS[cat]}</Typography>
            <Paper variant="outlined">
              <List disablePadding>
                {group.map((s, i) => (
                  <Box key={s.id}>
                    {i > 0 && <Divider component="li" />}
                    <ListItem
                      sx={{ pr: 13 }}
                      secondaryAction={
                        <Stack direction="row" alignItems="center">
                          <Switch
                            checked={s.enabled}
                            disabled={update.isPending}
                            onChange={(e) => update.mutate({ id: s.id, enabled: e.target.checked })}
                            inputProps={{ 'aria-label': `Suivre ${s.title}` }}
                          />
                          <IconButton aria-label={`Ne plus suivre ${s.title}`} onClick={() => setToDelete(s)}><DeleteOutlineIcon /></IconButton>
                        </Stack>
                      }
                    >
                      <ListItemAvatar>
                        <Avatar variant="rounded" src={s.imageUrl ?? undefined} alt="" sx={{ borderRadius: 2 }}>{s.title.slice(0, 1)}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={<>{s.title} <Typography component="span" variant="caption" color="text.secondary">· {s.sourceType === 'youtube' ? 'YouTube' : 'Podcast'} · {s.language.toUpperCase()}{s.titleFilter ? ` · filtre : ${s.titleFilter.join(', ')}` : ''}</Typography></>}
                        secondary={<Stack direction="row" spacing={0.5} alignItems="center" component="span">
                          {s.lastError && <ErrorOutlineIcon color="warning" sx={{ fontSize: 16 }} />}
                          <span>{status(s)}</span>
                        </Stack>}
                        secondaryTypographyProps={{ component: 'div' }}
                      />
                    </ListItem>
                    {s.sourceType === 'podcast' && <Box sx={{ pl: 9, pr: 2, pb: 1.25, mt: -1 }}><AutoPrepareChip show={s} /></Box>}
                  </Box>
                ))}
              </List>
            </Paper>
          </Box>
        );
      })}

      {adding && <AddShowDialog onClose={() => setAdding(false)} />}

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)}>
        <DialogTitle>Ne plus suivre {toDelete?.title} ?</DialogTitle>
        <DialogContent>
          <Typography>Ses contenus non sauvegardés disparaîtront d’Explorer. Les contenus sauvegardés ou préparés sont conservés.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Annuler</Button>
          <Button color="error" disabled={remove.isPending} onClick={() => { if (toDelete) remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) }); }}>Ne plus suivre</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
