import { Box, Link, Typography } from '@mui/material';

export function JudgmentSource({ url, licence }: { url?: string | null; licence?: string }) {
  if (!licence || !url) return null;
  return <Box sx={{ mt: 2, mb: 2 }}>
    <Typography variant="body2"><Link href={url} target="_blank" rel="noreferrer">Lire la décision source</Link></Typography>
    <Typography variant="caption" color="text.secondary">{licence}</Typography>
  </Box>;
}
