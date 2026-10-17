import { Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { usePreparedContents } from '../api/contents';
import { DeleteContentButton } from '../content/DeleteContentButton';

const kindOf = (id: string) => (id.startsWith('youtube-') ? 'YouTube' : id.startsWith('reflection-') ? 'Note My Mind' : 'Podcast');

export function PreparedContents() {
  const query = usePreparedContents();
  return <Box sx={{ px: 2, pt: 2, maxWidth: 760, mx: 'auto' }}>
    <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Préparés dans l’Atelier</Typography>
    {query.isPending && <CircularProgress size={24} />}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {query.isSuccess && !query.data.pages[0]?.total && <Typography color="text.secondary">Les contenus publiés depuis l’Atelier apparaîtront ici.</Typography>}
    <Stack spacing={1}>
      {query.data?.pages.flatMap((p) => p.contents).map((c) => <Card variant="outlined" key={c.id} sx={{ display: 'flex', alignItems: 'center' }}>
        <CardActionArea sx={{ flex: 1 }} component={Link} to={/^podcast-[0-9a-f]{20}$/.test(c.id) ? `/?e=${c.id.slice(8)}` : `/library/${c.id}`}><CardContent>
          <Typography fontWeight={600}>{c.title}</Typography>
          <Typography variant="body2" color="text.secondary">{kindOf(c.id)} · {c.originalLanguage.toUpperCase()} · {c.variantCount} version{c.variantCount > 1 ? 's' : ''}</Typography>
        </CardContent></CardActionArea>
        <Box sx={{ px: 0.5 }}><DeleteContentButton id={c.id} title={c.title} compact /></Box>
      </Card>)}
    </Stack>
    {query.hasNextPage && <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Voir la suite</Button>}
  </Box>;
}
