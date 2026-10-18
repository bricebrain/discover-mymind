import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem,
  ListItemButton, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import {
  MAX_SOURCES, MIN_SOURCES, useDossierCandidates, useDossierMutations, type Dossier, type DossierCandidate, type DossierRef,
} from '../api/dossiers';

type Picked = DossierRef & { title: string; label: string };
const key = (r: DossierRef) => `${r.type}:${r.id}`;

/** Création ou modification d'un dossier : un titre et 2 à 6 sources choisies à la main, dans l'ordre voulu. */
export function DossierEditor({ dossier, onClose, onSaved }: { dossier?: Dossier; onClose: () => void; onSaved: (d: Dossier) => void }) {
  const [title, setTitle] = useState(dossier?.title ?? '');
  const [picked, setPicked] = useState<Picked[]>(() => (dossier?.sources ?? []).map((s) => ({ type: s.type, id: s.id, title: s.title ?? 'Source indisponible', label: '' })));
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  const candidates = useDossierCandidates(debounced);
  const { create, update } = useDossierMutations();
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const full = picked.length >= MAX_SOURCES;

  const add = (c: DossierCandidate) => {
    if (full || picked.some((p) => key(p) === key(c))) return;
    setPicked((list) => [...list, { type: c.type, id: c.id, title: c.title, label: c.label }]);
  };
  const move = (index: number, delta: number) => setPicked((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    return next;
  });
  const save = () => {
    const body = { title: title.trim(), sources: picked.map(({ type, id }) => ({ type, id })) };
    const done = ({ dossier: saved }: { dossier: Dossier }) => onSaved(saved);
    if (dossier) update.mutate({ id: dossier.id, version: dossier.version, ...body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" scroll="paper">
    <DialogTitle>{dossier ? 'Modifier le dossier' : 'Nouveau dossier'}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <TextField label="Sujet du dossier" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 200 }} autoFocus={!dossier} />
        <Box>
          <Typography variant="overline" color="text.secondary">Sources choisies · {picked.length}/{MAX_SOURCES}</Typography>
          {!picked.length && <Typography variant="body2" color="text.secondary">Choisis au moins {MIN_SOURCES} sources complémentaires : épisodes, vidéos, contenus préparés ou notes.</Typography>}
          <List dense disablePadding>
            {picked.map((p, i) => <ListItem key={key(p)} disableGutters secondaryAction={<Stack direction="row">
              <IconButton size="small" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
              <IconButton size="small" aria-label="Descendre" disabled={i === picked.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
              <IconButton size="small" aria-label={`Retirer ${p.title}`} onClick={() => setPicked((l) => l.filter((x) => key(x) !== key(p)))}><CloseIcon fontSize="small" /></IconButton>
            </Stack>}>
              <ListItemText primary={`${i + 1}. ${p.title}`} secondary={p.label || undefined} primaryTypographyProps={{ noWrap: true, sx: { pr: 13 } }} />
            </ListItem>)}
          </List>
        </Box>
        <TextField label="Chercher une source" size="small" value={search} onChange={(e) => setSearch(e.target.value)} inputProps={{ maxLength: 200 }}
          helperText={full ? `${MAX_SOURCES} sources au maximum.` : 'Titre d’un épisode, d’une vidéo, d’un contenu préparé ou d’une note.'} />
        {candidates.isPending && <CircularProgress size={20} />}
        {candidates.isError && <Alert severity="warning">{candidates.error.message}</Alert>}
        <List dense sx={{ maxHeight: 280, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
          {candidates.data?.sources.map((c) => {
            const chosen = picked.some((p) => key(p) === key(c));
            return <ListItemButton key={key(c)} disabled={chosen || full} onClick={() => add(c)}>
              <ListItemText primary={c.title} primaryTypographyProps={{ noWrap: true }} />
              <Chip size="small" label={c.label} sx={{ ml: 1 }} />
              {!chosen && <AddIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />}
            </ListItemButton>;
          })}
          {candidates.isSuccess && !candidates.data.sources.length && <ListItem><ListItemText secondary="Aucune source ne correspond." /></ListItem>}
        </List>
        {error && <Alert severity="error">{error.message}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Annuler</Button>
      <Button variant="contained" onClick={save} disabled={saving || !title.trim() || picked.length < MIN_SOURCES}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </DialogActions>
  </Dialog>;
}
