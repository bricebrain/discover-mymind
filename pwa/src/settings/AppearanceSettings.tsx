import { Alert, Box, FormControl, FormControlLabel, FormLabel, Paper, Radio, RadioGroup, Typography } from '@mui/material';
import { useAppearance } from './AppearanceProvider';

export function AppearanceSettings() {
  const { mode, setMode, saveError } = useAppearance();

  return <Box component="section" aria-labelledby="appearance-title" sx={{ mt: 3 }}>
    <Typography id="appearance-title" component="h2" variant="h3" sx={{ mb: 1.5 }}>Apparence</Typography>
    <Paper variant="outlined" sx={{ p: 2 }}>
      <FormControl>
        <FormLabel id="theme-label">Thème de l’application</FormLabel>
        <RadioGroup row aria-labelledby="theme-label" name="theme" value={mode}
          onChange={(_, value) => { if (value === 'light' || value === 'dark') setMode(value); }}>
          <FormControlLabel value="light" control={<Radio />} label="Clair" />
          <FormControlLabel value="dark" control={<Radio />} label="Sombre" />
        </RadioGroup>
      </FormControl>
      <Typography variant="body2" color="text.secondary">Le choix s’applique immédiatement et est enregistré sur cet appareil.</Typography>
      {saveError && <Alert severity="warning" sx={{ mt: 2 }}>Le thème est appliqué, mais sa sauvegarde est impossible. Autorise le stockage local pour le conserver à la prochaine ouverture.</Alert>}
    </Paper>
  </Box>;
}
