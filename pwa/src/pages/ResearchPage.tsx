import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { ResearchArticleBody } from '../research/ResearchArticleBody';
import { useResearch } from '../research/useResearch';
import { ResearchTheme } from '../research/ResearchTheme';

const RUN_STATES = { reserved: 'En attente', running: 'Recherche en cours', drafted: 'Article préparé', skipped: 'Veille terminée sans nouvel article', failed: 'Recherche arrêtée' };
const DRAFT_STATES = { draft: 'Non publié', published: 'Publié', rejected: 'Écarté' };
const money = (micros: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);

function ResearchScreen() {
  const research = useResearch();
  const { status, drafts, detail, enable, autoPublish, run, publish, reject, selected, setSelected } = research;
  if (status.isPending) return <Box role="status" sx={{ p: 4, textAlign: 'center' }}><CircularProgress aria-label="Chargement de la veille" /></Box>;
  if (status.isError) return <Container sx={{ py: 3 }}><Alert severity="error" action={<Button onClick={() => void status.refetch()}>Réessayer</Button>}>{status.error.message}</Alert></Container>;
  const data = status.data, draft = detail.data?.draft;
  const busy = publish.isPending || reject.isPending;
  const error = enable.error ?? autoPublish.error ?? run.error ?? publish.error ?? reject.error;

  return <Container maxWidth="md" sx={{ py: 3 }}>
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h4" gutterBottom>Recherches Discover</Typography>
        <Typography color="text.secondary">Des sujets pour comprendre les avancées et leurs implications. {data.autoPublish
          ? 'Les articles sont publiés automatiquement après un contrôle documentaire favorable.'
          : 'Chaque article reste un brouillon jusqu’à ta validation.'}</Typography>
      </Box>
      <Card variant="outlined"><CardContent>
        <Stack spacing={2}>
          <FormControlLabel control={<Switch checked={data.enabled} disabled={enable.isPending || !data.configured}
            onChange={(_, checked) => enable.mutate(checked)} />} label="Veille automatique quotidienne" />
          <FormControlLabel control={<Switch checked={!!data.autoPublish} disabled={autoPublish.isPending || !data.configured}
            onChange={(_, checked) => autoPublish.mutate(checked)} />} label="Publier automatiquement après le contrôle documentaire" />
          {!data.configured && <Alert severity="warning">La recherche Gemini n’est pas encore configurée sur le serveur.</Alert>}
          <Typography variant="body2">Une veille par jour après 6 h UTC, jusqu’à {data.weeklyDrafts} articles sur sept jours. {data.autoPublish
            ? 'Les textes refusés ou présentant des réserves restent bloqués.'
            : 'La rédaction s’arrête lorsque six brouillons attendent ta validation.'}</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">{Object.entries(data.topics).map(([key, label]) => <Chip key={key} label={label} size="small" sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} />)}</Stack>
          <Typography variant="caption" color="text.secondary">Enveloppe réservée ce mois : {money(data.reservedMicros)} / {money(data.limitMicros)} ({money(data.reservePerRunMicros)} par veille). C’est une limite de réservations, pas une facture Gemini. Les préparations audio utilisent leur budget habituel.</Typography>
          <Button variant="outlined" disabled={!data.enabled || run.isPending} onClick={() => run.mutate()} sx={{ alignSelf: 'flex-start' }}>
            {run.isPending ? 'Déclenchement…' : 'Lancer la veille du jour'}
          </Button>
          {run.isSuccess && <Alert severity="info">Veille du jour demandée. Un second clic ne relance pas les appels Gemini.</Alert>}
        </Stack>
      </CardContent></Card>
      {error && <Alert severity="error">{error.message}</Alert>}
      <Box>
        <Typography component="h2" variant="h5" gutterBottom>Articles et brouillons</Typography>
        {drafts.isPending && <CircularProgress size={24} aria-label="Chargement des brouillons" />}
        {drafts.isError && <Alert severity="error" action={<Button onClick={() => void drafts.refetch()}>Réessayer</Button>}>{drafts.error.message}</Alert>}
        {drafts.data?.drafts.length === 0 && <Alert severity="info">Aucun brouillon pour l’instant. La veille peut ne rien proposer si les sources ou la nouveauté ne suffisent pas.</Alert>}
        <Stack spacing={1}>{drafts.data?.drafts.map(item => <Card variant="outlined" key={item.id}>
          <CardContent><Stack spacing={1}>
            <Typography component="h3" variant="subtitle1">{item.title}</Typography>
            <Typography variant="caption">{new Date(item.createdAt).toLocaleDateString('fr-FR')} · {DRAFT_STATES[item.state]} · Contrôle : {item.review.verdict === 'ok' ? 'favorable' : 'réserves à examiner'}</Typography>
            <Button onClick={() => setSelected(item.id)} sx={{ alignSelf: 'flex-start' }}>{item.state === 'published' ? 'Lire l’article et ses sources' : 'Lire le brouillon et ses sources'}</Button>
          </Stack></CardContent>
        </Card>)}</Stack>
      </Box>
      {selected && <Card variant="outlined"><CardContent>
        {detail.isPending && <CircularProgress aria-label="Chargement du brouillon" />}
        {detail.isError && <Alert severity="error">{detail.error.message}</Alert>}
        {draft && <Stack spacing={3}>
          <Typography component="h2" variant="h4">{draft.title}</Typography>
          <Typography>{draft.article.summary}</Typography>
          <Alert severity={draft.review.verdict === 'ok' ? 'success' : 'warning'}>
            {draft.review.verdict === 'ok' ? draft.state === 'published' ? 'Contrôle documentaire favorable. Cet article est publié.'
              : data.autoPublish ? 'Contrôle documentaire favorable. La publication automatique est en attente.'
                : 'Contrôle documentaire favorable. Relis les sources avant de publier.' : 'La publication est bloquée par le contrôle documentaire.'}
            {draft.review.reasons.map((reason, i) => <Typography key={i} variant="body2" sx={{ mt: 1 }}>{reason}</Typography>)}
          </Alert>
          <ResearchArticleBody article={draft.article} />
          <Divider />
          {draft.state === 'draft' ? <Stack direction="row" gap={2} flexWrap="wrap">
            <Button variant="contained" disabled={busy || draft.review.verdict !== 'ok'} onClick={() => publish.mutate(draft.id)}>Valider et publier</Button>
            <Button variant="outlined" disabled={busy} onClick={() => reject.mutate(draft.id)}>Écarter ce sujet</Button>
          </Stack> : <Alert severity="info">{DRAFT_STATES[draft.state]}{draft.state === 'published' && <> · <Link to={`/?a=${draft.id}`}>Lire l’article ou préparer son audio en anglais</Link></>}</Alert>}
        </Stack>}
      </CardContent></Card>}
      <Box>
        <Typography component="h2" variant="h6" gutterBottom>Dernières veilles</Typography>
        <Stack spacing={1}>{data.runs.map(item => <Typography key={item.id} variant="body2">
          {item.day} · {RUN_STATES[item.state]}{item.error && ` — ${item.error}`}
        </Typography>)}</Stack>
      </Box>
    </Stack>
  </Container>;
}

export function ResearchPage() {
  return <ResearchTheme><ResearchScreen /></ResearchTheme>;
}
