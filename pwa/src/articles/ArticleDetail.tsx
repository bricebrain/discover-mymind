import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import EditNoteIcon from '@mui/icons-material/EditNote';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useArticle, useArticleActions, type Article } from '../api/articles';
import { formatWhen } from '../api/episodes';
import { fonts } from '../app/theme';
import { PreparedEpisode } from '../components/PreparedEpisode';
import type { PrepareOptions } from '../queue/types';
import { readingTime } from './ArticleCard';

type Coverage = PrepareOptions['coverage'];
const COVERAGE: Record<Coverage, { label: string; minutes: number | null }> = {
  essentials: { label: 'L’essentiel · 4 min', minutes: 4 }, condensed: { label: 'Condensé · 8 min', minutes: 8 }, full: { label: 'Intégral', minutes: null },
};

function PrepareArticleDialog({ article, onClose }: { article: Article; onClose: () => void }) {
  const { toNote } = useArticleActions(article.id);
  const [coverage, setCoverage] = useState<Coverage>('essentials');
  const [level, setLevel] = useState<PrepareOptions['level']>('B1');
  const [done, setDone] = useState<string | null>(null);
  return <Dialog open onClose={toNote.isPending ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Préparer en anglais</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography variant="body2">{article.title}</Typography>
      {done ? <Alert severity="success">
        Préparation lancée. L’article est aussi enregistré dans My Mind ; la version anglaise apparaîtra ici et sous la note.
        {' '}<Button size="small" component={Link} to={`/mind?n=${done}`}>Ouvrir la note</Button>
      </Alert> : <>
        <TextField select label="Version" value={coverage} onChange={(e) => setCoverage(e.target.value as Coverage)}>
          {(Object.keys(COVERAGE) as Coverage[]).map((c) => <MenuItem key={c} value={c}>{COVERAGE[c].label}</MenuItem>)}
        </TextField>
        <TextField select label="Niveau d’anglais" value={level} onChange={(e) => setLevel(e.target.value as PrepareOptions['level'])}>
          {(['A2', 'B1', 'B2', 'C1', 'original'] as const).map((l) => <MenuItem key={l} value={l}>{l === 'original' ? 'Anglais non simplifié' : l}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary">L’Atelier adapte le texte à ton niveau et en fait une version audio, attribuée à {article.publisher}.</Typography>
      </>}
      {toNote.isError && <Alert severity="error">{toNote.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={toNote.isPending}>{done ? 'Fermer' : 'Annuler'}</Button>
      {!done && <Button variant="contained" disabled={toNote.isPending} onClick={() => toNote.mutate(
        { coverage, level, style: 'narration', targetMinutes: COVERAGE[coverage].minutes },
        { onSuccess: (r) => setDone(r.noteId) },
      )}>{toNote.isPending ? 'Envoi…' : 'Mettre à préparer'}</Button>}
    </DialogActions>
  </Dialog>;
}

/** Lecture d'un article : texte (flux ou récupéré par l'Atelier), enregistrement dans My Mind, préparation en anglais. */
export function ArticleDetail({ id, onBack }: { id: string; onBack?: () => void }) {
  const query = useArticle(id);
  const { fetchText, toNote } = useArticleActions(id);
  const navigate = useNavigate();
  const [preparing, setPreparing] = useState(false);
  const asked = useRef<string | null>(null);
  const a = query.data;
  // Sans texte dans le flux (The Guardian) : la récupération est demandée à l'ouverture, une fois.
  useEffect(() => {
    if (a && !a.contentText && a.contentStatus === 'none' && asked.current !== a.id) { asked.current = a.id; fetchText.mutate(); }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isPending) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={26} /></Box>;
  if (query.isError || !a) return <Alert severity="warning" sx={{ m: 2 }}>Article introuvable.</Alert>;
  const paragraphs = (a.contentText ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const time = readingTime(a.contentText?.length ?? null);

  return <Box sx={{ px: 2, pt: onBack ? 1 : 3, pb: 6, maxWidth: 720, mx: 'auto', animation: 'riseIn .25s ease-out' }}>
    {onBack && <IconButton onClick={onBack} aria-label="Retour aux articles" edge="start" sx={{ mb: 0.5 }}><ArrowBackIcon /></IconButton>}
    <Typography variant="overline" color="secondary" sx={{ fontWeight: 700 }}>{a.publisher}</Typography>
    <Typography component="h1" sx={{ fontFamily: fonts.display, fontSize: { xs: '1.75rem', sm: '2.1rem' }, fontWeight: 600, lineHeight: 1.15, mt: 0.5 }}>{a.title}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
      {[a.author, formatWhen(a.publishedAt), time].filter(Boolean).join(' · ')}
    </Typography>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 2 }}>
      <Button variant="contained" startIcon={<AutoAwesomeOutlinedIcon />} onClick={() => setPreparing(true)} disabled={!a.contentText && !a.summary}>
        {a.contentId ? 'Préparer une autre version' : 'Préparer en anglais'}
      </Button>
      <Button variant="outlined" startIcon={<EditNoteIcon />} disabled={toNote.isPending || (!a.contentText && !a.summary)}
        onClick={() => toNote.mutate(undefined, { onSuccess: (r) => navigate(`/mind?n=${r.noteId}`) })}>
        {a.reflectionId ? 'Ouvrir dans My Mind' : 'Enregistrer dans My Mind'}
      </Button>
      <Button component="a" href={a.url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />}>Lire sur le site</Button>
    </Stack>
    {toNote.isError && <Alert severity="error" sx={{ mb: 2 }}>{toNote.error.message}</Alert>}
    {a.contentId && <Box sx={{ mb: 3 }}><PreparedEpisode contentId={a.contentId} about={null} /></Box>}

    {a.contentStatus === 'pending' && <Stack spacing={0.75} sx={{ mb: 2 }} role="status">
      <Typography variant="body2" color="text.secondary">L’Atelier récupère le texte complet de l’article…</Typography>
      <LinearProgress sx={{ borderRadius: 1 }} />
    </Stack>}
    {a.contentStatus === 'partial' && <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>Texte partiel : le site n’a pas tout fourni. La fin est sur le site.</Alert>}
    {a.contentStatus === 'unavailable' && !a.contentText && <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}
      action={<Button color="inherit" size="small" onClick={() => fetchText.mutate()}>Réessayer</Button>}>Texte complet inaccessible depuis le site. Le résumé est affiché.</Alert>}

    <Box sx={{ fontFamily: fonts.reading, fontSize: '1.08rem', lineHeight: 1.8 }} lang={a.language}>
      {paragraphs.length ? paragraphs.map((p, i) => <Typography key={i} component="p" sx={{ font: 'inherit', mb: 2, whiteSpace: 'pre-line' }}>{p}</Typography>)
        : a.summary && <Typography component="p" sx={{ font: 'inherit', color: 'text.secondary' }}>{a.summary}</Typography>}
    </Box>
    {preparing && <PrepareArticleDialog article={a} onClose={() => setPreparing(false)} />}
  </Box>;
}
