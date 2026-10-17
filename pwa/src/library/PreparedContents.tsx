import { Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { usePreparedContents } from '../api/contents';

export function PreparedContents() {
  const query = usePreparedContents();
  return <Box sx={{ px: 2, pt: 2, maxWidth: 760, mx: 'auto' }}>
    <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Préparés dans l’Atelier</Typography>
    {query.isPending && <CircularProgress size={24} />}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {query.isSuccess && !query.data.pages[0]?.total && <Typography color="text.secondary">Les contenus publiés depuis l’Atelier apparaîtront ici.</Typography>}
    <Stack spacing={1}>
      {query.data?.pages.flatMap((p) => p.contents).map((c) => <Card variant="outlined" key={c.id}>
        <CardActionArea component={Link} to={/^podcast-[0-9a-f]{20}$/.test(c.id) ? `/?e=${c.id.slice(8)}` : `/library/${c.id}`}><CardContent>
          <Typography fontWeight={600}>{c.title}</Typography>
          <Typography variant="body2" color="text.secondary">{c.originalLanguage.toUpperCase()} · {c.variantCount} version{c.variantCount > 1 ? 's' : ''}</Typography>
        </CardContent></CardActionArea>
      </Card>)}
    </Stack>
    {query.hasNextPage && <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Voir la suite</Button>}
  </Box>;
}
