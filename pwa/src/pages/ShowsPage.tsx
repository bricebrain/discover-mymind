import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, List,
  ListItem, ListItemAvatar, ListItemButton, ListItemText, MenuItem, Paper, Stack, Switch, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { CATEGORY_LABELS, formatDuration, formatWhen, type Category } from '../api/episodes';
import {
  useCreateShow, useDeleteShow, usePreviewShow, useResolveShow, useShows, useUpdateShow, type Candidate, type Show, type ShowPreview,
} from '../api/shows';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Une erreur est survenue.');

function status(show: Show): string {
  if (!show.enabled) return 'En pause';
  if (show.lastError) return `Erreur : ${show.lastError}`;
  if (!show.lastSuccessAt) return 'Première vérification dans quelques minutes';
  return `${show.episodeCount} épisode${show.episodeCount > 1 ? 's' : ''} · vérifiée ${formatWhen(show.lastSuccessAt)}`;
}

export function ShowsPage() {
  const shows = useShows();
  const update = useUpdateShow();
  const remove = useDeleteShow();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Show | null>(null);
  const count = shows.data?.shows.length ?? 0;
  const max = shows.data?.max ?? 30;

  return (
    <Box sx={{ px: 2, pt: 2, pb: 4, maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={Link} to="/" aria-label="Retour à Explorer" edge="start"><ArrowBackIcon /></IconButton>
        <Typography variant="h1" component="h1" sx={{ flex: 1, fontSize: { xs: '1.6rem', sm: '2.1rem' } }}>Mes émissions</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={count >= max}>Ajouter</Button>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {count} / {max} émissions. Chacune est vérifiée environ toutes les 30 minutes.
      </Typography>

      {shows.isPending && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
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
                        primary={<>{s.title} <Typography component="span" variant="caption" color="text.secondary">· {s.language.toUpperCase()}{s.titleFilter ? ` · filtre : ${s.titleFilter.join(', ')}` : ''}</Typography></>}
                        secondary={<Stack direction="row" spacing={0.5} alignItems="center" component="span">
                          {s.lastError && <ErrorOutlineIcon color="warning" sx={{ fontSize: 16 }} />}
                          <span>{status(s)}</span>
                        </Stack>}
                      />
                    </ListItem>
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
          <Typography>Ses épisodes non sauvegardés disparaîtront d’Explorer. Les épisodes sauvegardés restent dans ta Bibliothèque.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Annuler</Button>
          <Button color="error" onClick={() => { if (toDelete) remove.mutate(toDelete.id); setToDelete(null); }}>Ne plus suivre</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Ajout : recherche (nom, lien Apple, RSS) → choix → aperçu → réglages → suivre. */
function AddShowDialog({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ShowPreview | null>(null);
  const [category, setCategory] = useState<Category>('news');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [filter, setFilter] = useState('');
  const resolve = useResolveShow();
  const previewShow = usePreviewShow();
  const create = useCreateShow();

  const showPreview = (p: ShowPreview) => {
    setPreview(p);
    setLanguage(p.language ?? 'fr');
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    setPreview(null);
    resolve.mutate(input, { onSuccess: (r) => r.kind === 'preview' && showPreview(r.preview) });
  };
  const choose = (c: Candidate) => previewShow.mutate(c, { onSuccess: (r) => showPreview(r.preview) });
  const follow = () => {
    if (!preview) return;
    const keywords = filter.split(',').map((k) => k.trim()).filter(Boolean);
    create.mutate(
      { feedUrl: preview.feedUrl, title: preview.title, publisher: preview.publisher, appleId: preview.appleId, imageUrl: preview.imageUrl,
        language, category, titleFilter: keywords.length ? keywords : null },
      { onSuccess: onClose },
    );
  };
  const candidates = resolve.data?.kind === 'candidates' ? resolve.data.candidates : [];
  const busy = resolve.isPending || previewShow.isPending;

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>Ajouter une émission</DialogTitle>
      <DialogContent>
        {!preview && (
          <>
            <Box component="form" onSubmit={search} sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                autoFocus fullWidth size="small" value={input} onChange={(e) => setInput(e.target.value)}
                label="Nom, lien Apple Podcasts ou adresse RSS"
              />
              <Button type="submit" variant="contained" disabled={input.trim().length < 2 || busy}>Chercher</Button>
            </Box>
            {busy && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
            {(resolve.isError || previewShow.isError) && <Alert severity="warning" sx={{ mt: 2 }}>{errorText(resolve.error ?? previewShow.error)}</Alert>}
            {resolve.data?.kind === 'candidates' && candidates.length === 0 && (
              <Typography color="text.secondary" sx={{ mt: 2 }}>Aucune émission trouvée avec un flux RSS public. Certaines radios (Radio France, par exemple) n’en publient pas dans l’annuaire Apple.</Typography>
            )}
            <List>
              {candidates.map((c) => (
                <ListItemButton key={c.appleId} onClick={() => choose(c)} disabled={busy}>
                  <ListItemAvatar><Avatar variant="rounded" src={c.imageUrl ?? undefined} alt="" sx={{ borderRadius: 2 }} /></ListItemAvatar>
                  <ListItemText primary={c.title} secondary={c.publisher} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}

        {preview && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar variant="rounded" src={preview.imageUrl ?? undefined} alt="" sx={{ width: 72, height: 72, borderRadius: 3 }} />
              <Box>
                <Typography variant="h3">{preview.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {[preview.publisher, preview.medianMinutes ? `≈ ${preview.medianMinutes} min` : null,
                    preview.episodesPerWeek ? `${preview.episodesPerWeek} épisode(s) / semaine` : null,
                    preview.hasTranscripts ? 'transcriptions fournies' : null].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
            </Stack>
            <Box>
              <Typography variant="overline" color="text.secondary">Derniers épisodes</Typography>
              {preview.latest.map((ep) => (
                <Typography key={ep.title} variant="body2" noWrap>
                  {ep.title} <Typography component="span" variant="caption" color="text.secondary">· {formatWhen(ep.publishedAt)} {formatDuration(ep.durationSec)}</Typography>
                </Typography>
              ))}
            </Box>
            <Stack direction="row" spacing={1.5}>
              <TextField select size="small" label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value as Category)} sx={{ flex: 1 }}>
                {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{CATEGORY_LABELS[c]}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Langue" value={language} onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')} sx={{ flex: 1 }}>
                <MenuItem value="fr">Français</MenuItem>
                <MenuItem value="en">Anglais</MenuItem>
              </TextField>
            </Stack>
            <TextField
              size="small" label="Filtre de titre (facultatif)" value={filter} onChange={(e) => setFilter(e.target.value)}
              helperText="Mots-clés séparés par des virgules, ex. PSG, Paris. Seuls les épisodes dont le titre en contient un seront gardés."
            />
            {create.isError && <Alert severity="warning">{errorText(create.error)}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {preview && <Button onClick={() => setPreview(null)}>Retour</Button>}
        <Button onClick={onClose}>Annuler</Button>
        {preview && <Button variant="contained" onClick={follow} disabled={create.isPending}>Suivre</Button>}
      </DialogActions>
    </Dialog>
  );
}
