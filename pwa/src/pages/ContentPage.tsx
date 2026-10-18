import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DeleteContentButton } from '../content/DeleteContentButton';
import { DownloadButton } from '../offline/DownloadButton';
import { useContent } from '../api/contents';
import { useContentReader } from '../content/useContentReader';
import { PlaybackControls, VariantSelector } from '../content/VariantControls';
import { VariantTranscript } from '../content/VariantTranscript';

export function ContentPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { libraryLocation?: unknown } | null)?.libraryLocation;
  const libraryLocation = typeof from === 'string' && /^\/library(?:\?|$)/.test(from) ? from : '/library';
  const query = useContent(id);
  const reader = useContentReader(query.data);
  const variant = reader.variant;
  return <Box sx={{ px: 2, py: 3, maxWidth: 760, mx: 'auto' }}>
    <Button component={Link} to={libraryLocation}>Retour à la bibliothèque</Button>
    {query.isPending && <Box sx={{ py: 3 }}><CircularProgress size={28} /></Box>}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {query.isSuccess && !variant && <Alert severity="info">Aucune version disponible pour ce contenu.</Alert>}
    {query.data && variant && <>
      <Typography variant="h1" sx={{ mt: 2 }}>{query.data.content.title}</Typography>
      {reader.unavailableVersion && <Alert severity="info" sx={{ mt: 2 }}>La version demandée n’est plus disponible. Une version présente est affichée.</Alert>}
      <VariantSelector variants={query.data.variants} selected={variant} onSelect={reader.select} />
      <PlaybackControls reader={reader} />
      <DownloadButton detail={query.data} variant={variant} />
      <VariantTranscript key={`${query.data.publicationId}:${variant.key}`} detail={query.data} variant={variant}
        activePositionMs={reader.activePositionMs} verified={reader.verified} playing={reader.playing} onSeek={reader.play} />
      <Box sx={{ mt: 3 }}><DeleteContentButton id={id} title={query.data.content.title} onDeleted={() => navigate(libraryLocation, { replace: true })} /></Box>
    </>}
  </Box>;
}
