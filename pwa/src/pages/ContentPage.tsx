import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useContent } from '../api/contents';
import { usePlayer } from '../player/PlayerProvider';

/** Lot 6 : consultation de la source ; le lecteur multiversion arrive au lot 7. */
export function ContentPage() {
  const { id = '' } = useParams();
  const query = useContent(id);
  const player = usePlayer();
  const source = query.data?.variants.find((v) => v.kind === 'source');
  const segments = useQuery({ queryKey: ['content-segments',query.data?.publicationId,source?.key], enabled: !!source,
    queryFn: () => api<{ segments: { id: string; text: string }[] }>(source!.segmentsUrl) });
  return <Box sx={{ px: 2, py: 3, maxWidth: 760, mx: 'auto' }}>
    <Button component={Link} to="/library">Retour à la bibliothèque</Button>
    {query.isPending && <CircularProgress size={28} />}
    {query.isError && <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>}
    {query.data && <>
      <Typography variant="h1" sx={{ mt: 2 }}>{query.data.content.title}</Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ my: 2 }}>
        {query.data.variants.map((v) => <Chip key={v.key} label={`${v.kind === 'source' ? 'Original' : v.kind === 'faithful_translation' ? 'Fidèle' : v.coverage === 'condensed' ? 'Condensé' : v.coverage === 'essentials' ? 'L’essentiel' : 'Intégral'} · ${v.language}${v.cefrLevel ? ` · ${v.cefrLevel}` : ''}`} />)}
      </Stack>
      {source?.audio && <Button variant="contained" onClick={() => player.play({
        targetType: 'variant',targetId: `${id}:${source.key}`,audioRef: source.audio!.sha256 ?? source.audio!.url,
        src: source.audio!.url,title: query.data!.content.title,subtitle: 'Original',imageUrl: null,durationSec: source.audio!.durationMs/1000,
      })}>Écouter l’original</Button>}
      <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>Texte original</Typography>
      {segments.isPending && <CircularProgress size={24} />}
      {segments.isError && <Alert severity="warning" action={<Button onClick={() => void segments.refetch()}>Réessayer</Button>}>{segments.error.message}</Alert>}
      {segments.data?.segments.map((s) => <Typography key={s.id} sx={{ mb: 2, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{s.text}</Typography>)}
    </>}
  </Box>;
}
