import { Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { usePreparedContents, type LibraryFilters } from '../api/contents';
import { DeleteContentButton } from '../content/DeleteContentButton';

const SOURCE_LABELS = { youtube: 'YouTube', reflection: 'Note My Mind', podcast: 'Podcast' };

export function PreparedContents({ filters = {} }: { filters?: LibraryFilters }) {
  const query = usePreparedContents(filters);
  const location = useLocation();
  return <Box sx={{ pt: 2 }}>
    <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Préparés dans l’Atelier</Typography>
    {query.isPending && <CircularProgress size={24} />}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {query.isSuccess && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      {query.data.pages[0]?.total ?? 0} contenu{query.data.pages[0]?.total === 1 ? '' : 's'}
    </Typography>}
    {query.isSuccess && !query.data.pages[0]?.total && <Typography color="text.secondary">
      {filters.search ? 'Aucun contenu ne correspond à ce titre.' : 'Les contenus publiés depuis l’Atelier apparaîtront ici. Les demandes en cours sont dans « À préparer ».'}
    </Typography>}
    <Stack spacing={1}>
      {query.data?.pages.flatMap((p) => p.contents).map((c) => <Card variant="outlined" key={c.id} sx={{ display: 'flex', alignItems: 'center' }}>
        <CardActionArea sx={{ flex: 1 }} component={Link} state={{ libraryLocation: location.pathname + location.search }}
          to={c.sourceType === 'podcast' && /^podcast-[0-9a-f]{20}$/.test(c.id) ? `/?e=${c.id.slice(8)}` : `/library/${c.id}`}><CardContent>
          <Typography fontWeight={600}>{c.title}</Typography>
          <Typography variant="body2" color="text.secondary">{SOURCE_LABELS[c.sourceType]} · {c.originalLanguage.toUpperCase()} · {c.variantCount} version{c.variantCount > 1 ? 's' : ''}</Typography>
        </CardContent></CardActionArea>
        <Box sx={{ px: 0.5 }}><DeleteContentButton id={c.id} title={c.title} compact /></Box>
      </Card>)}
    </Stack>
    {query.hasNextPage && <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Voir la suite</Button>}
  </Box>;
}
