import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useDossierMutations, type Dossier, type DossierOptions } from '../api/dossiers';

const RANGE = { condensed: [8, 20], essentials: [3, 6] } as const;

/** Options d'une synthèse commune : condensé ou l'essentiel (pas d'intégral pour plusieurs sources). */
export function DossierPrepareDialog({ dossier, onClose }: { dossier: Dossier; onClose: () => void }) {
  const [options, setOptions] = useState<DossierOptions>({ coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 12 });
  const { prepare } = useDossierMutations();
  const [min, max] = RANGE[options.coverage];
  const valid = Number.isInteger(options.targetMinutes) && options.targetMinutes >= min && options.targetMinutes <= max;
  return <Dialog open onClose={prepare.isPending ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Préparer le dossier</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography variant="body2">{dossier.title} · {dossier.sources.length} sources</Typography>
      <TextField select label="Version" value={options.coverage} onChange={(e) => {
        const coverage = e.target.value as DossierOptions['coverage'];
        setOptions((o) => ({ ...o, coverage, targetMinutes: coverage === 'condensed' ? 12 : 5 }));
      }}>
        <MenuItem value="condensed">Condensé (synthèse détaillée)</MenuItem>
        <MenuItem value="essentials">L’essentiel</MenuItem>
      </TextField>
      <TextField select label="Niveau d’anglais" value={options.level} onChange={(e) => setOptions((o) => ({ ...o, level: e.target.value as DossierOptions['level'] }))}>
        {(['A2', 'B1', 'B2', 'C1', 'original'] as const).map((v) => <MenuItem key={v} value={v}>{v === 'original' ? 'Anglais non simplifié' : v}</MenuItem>)}
      </TextField>
      <TextField type="number" label="Durée cible en minutes" value={options.targetMinutes} error={!valid} helperText={`Entre ${min} et ${max} minutes`}
        inputProps={{ min, max, step: 1 }} onChange={(e) => setOptions((o) => ({ ...o, targetMinutes: Number(e.target.value) }))} />
      <TextField select label="Style" value={options.style} onChange={(e) => setOptions((o) => ({ ...o, style: e.target.value as DossierOptions['style'] }))}>
        <MenuItem value="narration">Narration</MenuItem><MenuItem value="dialogue">Dialogue</MenuItem>
      </TextField>
      <Typography variant="caption" color="text.secondary">
        L’Atelier prépare chaque source, puis écrit une synthèse commune : les points communs sont dits une fois, les désaccords
        sont explicités et chaque paragraphe renvoie à ses sources. Les sources sont figées au lancement.
      </Typography>
      {prepare.isError && <Alert severity="error">{prepare.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={prepare.isPending}>Annuler</Button>
      <Button variant="contained" disabled={!valid || prepare.isPending} onClick={() => prepare.mutate({ id: dossier.id, options }, { onSuccess: onClose })}>
        {prepare.isPending ? 'Envoi…' : 'Mettre à préparer'}
      </Button>
    </DialogActions>
  </Dialog>;
}
