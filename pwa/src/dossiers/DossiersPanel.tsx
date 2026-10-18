import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Collapse, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDossier, useDossiers, type Dossier } from '../api/dossiers';
import { DossierEditor } from './DossierEditor';
import { DossierPrepareDialog } from './DossierPrepareDialog';

const TYPES = { episode: 'Épisode', content: 'Contenu préparé', reflection: 'Note' } as const;
const STATUS = { pending: 'En file · ouvrir l’Atelier sur le Mac', leased: 'En préparation dans l’Atelier', done: 'Prêt', failed: 'Échec', cancelled: 'Annulé' } as const;
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function Runs({ id }: { id: string }) {
  const query = useDossier(id);
  if (query.isPending) return <CircularProgress size={18} />;
  if (query.isError) return <Alert severity="warning">{query.error.message}</Alert>;
  if (!query.data.runs.length) return <Typography variant="body2" color="text.secondary">Pas encore préparé.</Typography>;
  return <Stack spacing={0.5}>
    {query.data.runs.map((r) => <Stack key={r.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
      <Typography variant="body2" sx={{ flex: 1 }}>
        {dateFmt.format(new Date(r.createdAt))} · version {r.version} · {r.status ? STATUS[r.status] : 'Demande retirée'}
      </Typography>
      {r.status === 'done' && r.contentId && <Button size="small" component={Link} to={`/library/${r.contentId}`}>Écouter</Button>}
    </Stack>)}
  </Stack>;
}

function DossierCard({ dossier, onEdit, onPrepare }: { dossier: Dossier; onEdit: () => void; onPrepare: () => void }) {
  const [open, setOpen] = useState(false);
  const missing = dossier.sources.filter((s) => !s.title).length;
  return <Card variant="outlined">
    <CardContent>
      <Typography fontWeight={650}>{dossier.title}</Typography>
      <Typography variant="body2" color="text.secondary">{dossier.sources.length} sources · modifié le {dateFmt.format(new Date(dossier.updatedAt))}</Typography>
      <Box component="ol" sx={{ pl: 2.5, my: 1 }}>
        {dossier.sources.map((s) => <Typography component="li" variant="body2" key={`${s.type}:${s.id}`} color={s.title ? 'text.primary' : 'warning.main'}>
          {s.title ?? 'Source indisponible'} <Typography component="span" variant="caption" color="text.secondary">· {TYPES[s.type]}</Typography>
        </Typography>)}
      </Box>
      {missing > 0 && <Alert severity="warning" sx={{ mb: 1 }}>Une source a été supprimée : retire-la avant de préparer.</Alert>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button size="small" variant="contained" startIcon={<AutoAwesomeOutlinedIcon />} onClick={onPrepare} disabled={missing > 0}>Préparer en anglais</Button>
        <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onEdit}>Modifier</Button>
        <Button size="small" onClick={() => setOpen((v) => !v)}>{open ? 'Masquer les préparations' : 'Préparations'}</Button>
      </Stack>
      <Collapse in={open} unmountOnExit><Box sx={{ mt: 1.5 }}><Runs id={dossier.id} /></Box></Collapse>
    </CardContent>
  </Card>;
}

/** Dossiers multisources : plusieurs sources complémentaires, une synthèse commune préparée par l'Atelier. */
export function DossiersPanel() {
  const query = useDossiers();
  const [editing, setEditing] = useState<Dossier | 'new' | null>(null);
  const [preparing, setPreparing] = useState<Dossier | null>(null);
  return <Box sx={{ pt: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      Réunis 2 à 6 épisodes, vidéos, contenus préparés ou notes sur un même sujet : l’Atelier en fait une synthèse en anglais
      qui évite les répétitions, explicite les désaccords et renvoie à chaque source.
    </Typography>
    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing('new')} sx={{ mb: 2 }}>Nouveau dossier</Button>
    {query.isPending && <CircularProgress size={24} />}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {query.isSuccess && !query.data.dossiers.length && <Typography color="text.secondary">Aucun dossier pour l’instant.</Typography>}
    <Stack spacing={1.5}>
      {query.data?.dossiers.map((d) => <DossierCard key={d.id} dossier={d} onEdit={() => setEditing(d)} onPrepare={() => setPreparing(d)} />)}
    </Stack>
    {editing && <DossierEditor dossier={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
      onSaved={(saved) => { setEditing(null); if (editing === 'new') setPreparing(saved); }} />}
    {preparing && <DossierPrepareDialog dossier={preparing} onClose={() => setPreparing(null)} />}
  </Box>;
}
