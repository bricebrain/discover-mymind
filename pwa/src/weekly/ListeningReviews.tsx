import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useListeningReviews } from '../api/listeningReviews';

export function ListeningReviews() {
  const query = useListeningReviews();
  return <Card component="section" aria-label="À réécouter aujourd’hui" variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
    <CardContent>
      <Typography component="h2" variant="h6">À réécouter aujourd’hui</Typography>
      {query.isPending && <CircularProgress size={22} aria-label="Chargement des réécoutes" />}
      {query.isError && <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
      {query.data?.reviews.length === 0 && <Typography variant="body2" color="text.secondary">Aucune réécoute prévue aujourd’hui.</Typography>}
      <Stack spacing={1} sx={{ mt: 1 }}>
        {query.data?.reviews.map(review => <Box key={review.contentId}>
          <Button component={Link} to={`/library/${encodeURIComponent(review.contentId)}?v=${encodeURIComponent(review.variantKey)}&review=1&step=4`}
            sx={{ justifyContent: 'flex-start', textTransform: 'none', color: '#03915A' }}>{review.title}</Button>
          <Typography variant="caption" display="block" color="text.secondary">Palier {review.step} · Réécouter le passage sans le texte</Typography>
        </Box>)}
      </Stack>
    </CardContent>
  </Card>;
}
