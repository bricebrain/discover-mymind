import {
  Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItemAvatar, ListItemButton, ListItemText, MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { CATEGORY_LABELS, formatDuration, formatWhen, type Category } from '../api/episodes';
import { useCreateShow, usePreviewShow, useResolveShow, type Candidate, type ShowPreview } from '../api/shows';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Une erreur est survenue.';

/** Ajout : recherche (nom, lien Apple, RSS) → choix → aperçu → réglages → suivre. */
export function AddShowDialog({ onClose }: { onClose: () => void }) {
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
        sourceType: preview.sourceType, channelId: preview.channelId,
        language, category, titleFilter: keywords.length ? keywords : null },
      { onSuccess: onClose },
    );
  };
  const candidates = resolve.data?.kind === 'candidates' ? resolve.data.candidates : [];
  const busy = resolve.isPending || previewShow.isPending;

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>Ajouter un podcast ou une chaîne</DialogTitle>
      <DialogContent>
        {!preview && (
          <>
            <Box component="form" onSubmit={search} sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                autoFocus fullWidth size="small" value={input} onChange={(e) => setInput(e.target.value)}
                label="Podcast, lien de chaîne YouTube ou @identifiant"
                helperText="Podcast : nom, Apple Podcasts ou RSS. YouTube : lien de chaîne ou @identifiant."
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
                    preview.episodesPerWeek ? `${preview.episodesPerWeek} ${preview.sourceType === 'youtube' ? 'vidéo(s)' : 'épisode(s)'} / semaine` : null,
                    preview.hasTranscripts ? 'transcriptions fournies' : null].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
            </Stack>
            <Box>
              <Typography variant="overline" color="text.secondary">{preview.sourceType === 'youtube' ? 'Dernières vidéos' : 'Derniers épisodes'}</Typography>
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
              helperText="Mots-clés séparés par des virgules, ex. PSG, Paris. Seuls les contenus dont le titre en contient un seront gardés."
            />
            {preview.sourceType === 'youtube' && <Typography variant="body2" color="text.secondary">Les nouvelles vidéos apparaîtront dans Explorer. Tu choisis celles à préparer ; aucun audio n’est généré automatiquement.</Typography>}
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
