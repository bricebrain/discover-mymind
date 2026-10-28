import { Box, LinearProgress, Typography } from '@mui/material';
import { useActivePreparation } from '../queue/usePreparation';
import { STAGES } from '../queue/options';

export function ArticlePreparationStatus({ reflectionId, ready = false }: { reflectionId: string | null; ready?: boolean }) {
  const prep = useActivePreparation('reflection', reflectionId);
  if (ready || !prep) return null;
  return <Box component="span" role="status" sx={{ display: 'block', mt: 1 }}>
    <Typography component="span" variant="caption" sx={{ display: 'block' }}>
      {prep.status === 'leased' ? STAGES[prep.stage ?? ''] ?? 'Préparation' : 'En attente de l’Atelier'} · Version et audio en anglais
    </Typography>
    <LinearProgress aria-label="Préparation en anglais" variant={prep.progress ? 'determinate' : 'indeterminate'}
      value={prep.progress?.percent} sx={{ mt: .5, maxWidth: 240 }} />
  </Box>;
}
