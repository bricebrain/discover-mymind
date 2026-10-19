import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Radio, RadioGroup,
  Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { AUTO_PRESETS, useAutoPrepareSetting, useUpdateShow, type AutoLevel, type AutoPreset, type Show } from '../api/shows';

const LEVELS: AutoLevel[] = ['A2', 'B1', 'B2', 'C1', 'original'];
const levelLabel = (l: AutoLevel) => (l === 'original' ? 'non simplifié' : l);

/** Carte en tête des abonnements : interrupteur général et rappel du fonctionnement. */
export function AutoPrepareCard({ enabled, shows }: { enabled: boolean; shows: Show[] }) {
  const setting = useAutoPrepareSetting();
  const active = shows.filter((s) => s.enabled && s.autoPrepare && s.sourceType === 'podcast');
  return <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <AutoAwesomeOutlinedIcon color="primary" />
      <Typography fontWeight={650} sx={{ flex: 1 }}>Préparation automatique chaque matin</Typography>
      <Switch checked={enabled} disabled={setting.isPending} onChange={(e) => setting.mutate(e.target.checked)}
        inputProps={{ 'aria-label': 'Activer les préparations automatiques' }} />
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
      {enabled
        ? `${active.length} émission${active.length > 1 ? 's' : ''} préparée${active.length > 1 ? 's' : ''} automatiquement : le dernier épisode est mis en file dès sa parution, puis l’Atelier le prépare et le publie.`
        : 'Coupé : aucune émission n’est préparée automatiquement. Tes réglages par émission sont conservés.'}
      {' '}La voix Deepgram reste limitée par ton plafond mensuel ; au-delà, l’Atelier passe sur Kokoro.
    </Typography>
    {setting.isError && <Alert severity="warning" sx={{ mt: 1 }}>{setting.error.message}</Alert>}
  </Paper>;
}

/** Pastille d'une émission : réglage actuel, ouvre le dialogue. Podcasts uniquement. */
export function AutoPrepareChip({ show }: { show: Show }) {
  const [open, setOpen] = useState(false);
  if (show.sourceType !== 'podcast') return null;
  return <>
    <Chip size="small" variant={show.autoPrepare ? 'filled' : 'outlined'} color={show.autoPrepare ? 'primary' : 'default'}
      icon={<AutoAwesomeOutlinedIcon />} sx={{ mt: 0.75 }} onClick={() => setOpen(true)}
      label={show.autoPrepare ? `Auto · ${AUTO_PRESETS[show.autoPreset].label} · ${levelLabel(show.autoLevel)}` : 'Préparer automatiquement'} />
    {open && <AutoPrepareDialog show={show} onClose={() => setOpen(false)} />}
  </>;
}

function AutoPrepareDialog({ show, onClose }: { show: Show; onClose: () => void }) {
  const update = useUpdateShow();
  const [on, setOn] = useState(true);
  const [preset, setPreset] = useState<AutoPreset>(show.autoPreset);
  const [level, setLevel] = useState<AutoLevel>(show.autoLevel);
  const save = (autoPrepare: boolean) => update.mutate({ id: show.id, autoPrepare, autoPreset: preset, autoLevel: level }, { onSuccess: onClose });
  return <Dialog open onClose={update.isPending ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Préparation automatique</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <Typography variant="body2">{show.title}</Typography>
        <FormControlLabel control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} />} label="Préparer chaque nouvel épisode" />
        <RadioGroup value={preset} onChange={(e) => setPreset(e.target.value as AutoPreset)}>
          {(Object.keys(AUTO_PRESETS) as AutoPreset[]).map((p) => <FormControlLabel key={p} value={p} control={<Radio />} disabled={!on}
            label={<Stack><Typography variant="body2" fontWeight={600}>{AUTO_PRESETS[p].label}</Typography>
              <Typography variant="caption" color="text.secondary">{AUTO_PRESETS[p].cost}</Typography></Stack>} />)}
        </RadioGroup>
        <TextField select label="Niveau d’anglais" value={level} disabled={!on} onChange={(e) => setLevel(e.target.value as AutoLevel)}>
          {LEVELS.map((l) => <MenuItem key={l} value={l}>{l === 'original' ? 'Anglais non simplifié' : l}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary">
          Seul le dernier épisode est préparé, une seule fois. Les coûts sont des estimations ; l’Atelier affiche le coût réel avant chaque génération.
        </Typography>
        {update.isError && <Alert severity="error">{update.error.message}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={update.isPending}>Annuler</Button>
      <Button variant="contained" disabled={update.isPending} onClick={() => save(on)}>Enregistrer</Button>
    </DialogActions>
  </Dialog>;
}
