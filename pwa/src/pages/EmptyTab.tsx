import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** Onglet sans contenu pour l'instant : titre, icône et une phrase d'explication. */
export function EmptyTab({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ px: 2, pt: 2, pb: 4, maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h1" component="h1" sx={{ mb: 3 }}>{title}</Typography>
      <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center', color: 'text.secondary', py: 8 }}>
        <Box sx={{ fontSize: 48, lineHeight: 1, color: 'primary.main', '& svg': { fontSize: 48 } }}>{icon}</Box>
        <Typography sx={{ maxWidth: 320 }}>{children}</Typography>
      </Stack>
    </Box>
  );
}
