import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import type { Episode } from '../api/episodes';
import { COVERAGES, defaultOptions } from './options';
import type { PrepareOptions } from './types';
import { usePreparation } from './usePreparation';

export function PrepareDialog({episode,onClose}: {episode: Episode;onClose:() => void}) {
  const [options,setOptions] = useState(() => defaultOptions(episode.durationSec,episode.showId));
  const {prepare} = usePreparation(episode.id);
  const set = <K extends keyof PrepareOptions>(key: K,value: PrepareOptions[K]) => setOptions((o) => ({...o,[key]:value}));
  const range = options.coverage==='condensed' ? [8,20] : [3,6];
  const valid = options.coverage==='full' || (Number.isInteger(options.targetMinutes) && options.targetMinutes!>=range[0]! && options.targetMinutes!<=range[1]!);
  return <Dialog open onClose={prepare.isPending ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Préparer en anglais</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{pt:1}}>
      <Typography variant="body2">{episode.title}</Typography>
      <TextField select label="Version" value={options.coverage} onChange={(e) => {
        const coverage=e.target.value as PrepareOptions['coverage'];
        setOptions((o) => ({...o,coverage,targetMinutes:coverage==='full' ? null : coverage==='condensed' ? 12 : 4}));
      }}>{Object.entries(COVERAGES).map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <TextField select label="Niveau d’anglais" value={options.level} onChange={(e) => set('level',e.target.value as PrepareOptions['level'])}>
        {['A2','B1','B2','C1','original'].map((v) => <MenuItem key={v} value={v}>{v==='original' ? 'Anglais non simplifié' : v}</MenuItem>)}
      </TextField>
      {options.coverage!=='full' && <TextField type="number" label="Durée cible en minutes" value={options.targetMinutes ?? ''} error={!valid}
        helperText={`Entre ${range[0]} et ${range[1]} minutes`} inputProps={{min:range[0],max:range[1],step:1}} onChange={(e) => set('targetMinutes',Number(e.target.value))} />}
      <TextField select label="Style" value={options.style} onChange={(e) => set('style',e.target.value as PrepareOptions['style'])}>
        <MenuItem value="narration">Narration</MenuItem><MenuItem value="dialogue">Dialogue</MenuItem>
      </TextField>
      {episode.language==='fr' && <FormControlLabel control={<Checkbox checked={options.faithful} onChange={(_e,v) => set('faithful',v)} />} label="Ajouter l’anglais fidèle intégral" />}
      <FormControlLabel control={<Checkbox checked={options.keepOriginalCopy} onChange={(_e,v) => set('keepOriginalCopy',v)} />} label="Garder une copie synchronisée de l’original" />
      <Typography variant="caption" color="text.secondary">La demande sera traitée par l’Atelier sur ton Mac. L’import et la transcription sont disponibles ; les versions adaptées seront disponibles dans une prochaine mise à jour.</Typography>
      {prepare.isError && <Alert severity="error">{prepare.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={prepare.isPending}>Annuler</Button><Button variant="contained" disabled={!valid || prepare.isPending}
      onClick={() => prepare.mutate(options,{onSuccess:onClose})}>{prepare.isPending ? 'Envoi…' : 'Mettre à préparer'}</Button></DialogActions>
  </Dialog>;
}
