import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Fab, Snackbar, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatWhen } from '../api/episodes';
import { fonts } from '../app/theme';
import { NoteEditor } from '../mind/NoteEditor';
import { dirtyDrafts, newDraft, putDraft, syncDirtyDrafts, type NoteLink, type NoteSummary } from '../mind/store';

/** Aperçu lisible d'un texte Markdown : sans symboles de mise en forme. */
const plain = (md: string) => md.replace(/^#{1,3}\s+/gm, '').replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

/** Crée un brouillon (éventuellement lié à un épisode) et ouvre l'éditeur. Utilisé par « Réfléchir ». */
export function useNewNote() {
  const navigate = useNavigate();
  return async (links: NoteLink[] = []) => {
    const d = newDraft(links);
    await putDraft(d);
    navigate(`/mind?n=${d.id}`);
  };
}

/** Sans titre : la première ligne de la note sert de titre, la suite d'aperçu. */
function cardText(note: NoteSummary): { title: string; text: string } {
  if (note.title) return { title: note.title, text: plain(note.excerpt) };
  const lines = note.excerpt.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = plain(lines[0] ?? '');
  return { title: first.slice(0, 90) || 'Note sans titre', text: plain(lines.slice(1).join(' ')) };
}

function NoteCard({ note, selected, onOpen }: { note: NoteSummary; selected: boolean; onOpen: () => void }) {
  const { title, text } = cardText(note);
  return (
    <ButtonBase onClick={onOpen} aria-current={selected ? 'true' : undefined} sx={{
      display: 'block', width: '100%', textAlign: 'left', p: 1.75, borderRadius: 4,
      bgcolor: selected ? 'action.selected' : 'transparent', '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
    }}>
      <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '1.08rem', lineHeight: 1.3 }}>{title}</Typography>
      {text && text !== title && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {text}
        </Typography>
      )}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75, color: 'text.secondary' }}>
        <Typography variant="caption">{note.localOnly ? 'Sur cet appareil' : formatWhen(note.updatedAt)}</Typography>
        {note.firstLinkTitle && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <LinkIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" noWrap>{note.firstLinkTitle}</Typography>
          </Stack>
        )}
      </Stack>
    </ButtonBase>
  );
}

export function MindPage() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('n');
  const newNote = useNewNote();
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState<NoteSummary[]>([]);

  const notes = useQuery({
    queryKey: ['reflections'],
    queryFn: async () => (await api<{ reflections: NoteSummary[] }>('/api/reflections')).reflections,
  });

  // Brouillons jamais envoyés (créés hors ligne) : visibles dans la liste ; envoi au démarrage et au retour du réseau.
  useEffect(() => {
    const refresh = async () => {
      const drafts = await dirtyDrafts();
      setLocalOnly(drafts.filter((d) => d.baseUpdatedAt === null && (d.title || d.body)).map((d) => ({
        id: d.id, title: d.title || null, excerpt: d.body.slice(0, 280), updatedAt: new Date(d.localUpdatedAt).toISOString(),
        firstLinkTitle: d.links[0]?.targetTitle ?? null, linkCount: d.links.length, localOnly: true,
      })));
    };
    const sync = async () => {
      if ((await syncDirtyDrafts(selected)) > 0) void qc.invalidateQueries({ queryKey: ['reflections'] });
      await refresh();
    };
    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [qc, notes.dataUpdatedAt, selected]);

  const all = useMemo(() => {
    const server = notes.data ?? [];
    const merged = [...localOnly.filter((l) => !server.some((s) => s.id === l.id)), ...server];
    const q = query.trim().toLowerCase();
    return q ? merged.filter((n) => `${n.title ?? ''} ${n.excerpt} ${n.firstLinkTitle ?? ''}`.toLowerCase().includes(q)) : merged;
  }, [notes.data, localOnly, query]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('n', id);
    else next.delete('n');
    setParams(next, { replace: wide });
  };

  const onDeleted = (id: string, onServer: boolean) => {
    open(null);
    setLocalOnly((l) => l.filter((n) => n.id !== id));
    if (onServer) setUndo(id);
  };
  const restore = async () => {
    if (!undo) return;
    await api(`/api/reflections/${undo}/restore`, { method: 'POST' }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ['reflections'] });
    open(undo);
    setUndo(null);
  };

  const list = (
    <Box sx={{ px: { xs: 1, sm: 1.5 }, pt: 2.5, pb: 12, maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ px: 1 }}>
        <Typography variant="overline" color="text.secondary">Journal de réflexion</Typography>
        <Typography variant="h1" component="h1" sx={{ mb: 2 }}>My Mind</Typography>
        <TextField size="small" fullWidth placeholder="Chercher dans mes notes" value={query} onChange={(e) => setQuery(e.target.value)}
          inputProps={{ 'aria-label': 'Chercher dans mes notes' }} sx={{ mb: 1 }} />
      </Box>
      {notes.isPending && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={26} /></Box>}
      {notes.isError && <Alert severity="warning" sx={{ m: 1 }}>{notes.error.message}</Alert>}
      {notes.isSuccess && all.length === 0 && (
        <Stack alignItems="center" spacing={2} sx={{ py: 8, px: 3, textAlign: 'center' }}>
          <Typography sx={{ fontFamily: fonts.reading, fontSize: '1.08rem', color: 'text.secondary', maxWidth: 340 }}>
            {query ? 'Aucune note ne correspond.' : 'Une idée, une question, une réaction à un épisode : écris-la ici. Elle est enregistrée sur ton téléphone avant même d’être synchronisée.'}
          </Typography>
          {!query && <Button variant="contained" startIcon={<AddIcon />} onClick={() => void newNote()}>Nouvelle note</Button>}
        </Stack>
      )}
      <Stack spacing={0.25}>
        {all.map((n) => <NoteCard key={n.id} note={n} selected={n.id === selected} onOpen={() => open(n.id)} />)}
      </Stack>
    </Box>
  );

  const fab = (
    <Fab color="primary" aria-label="Nouvelle note" onClick={() => void newNote()} sx={{
      position: 'fixed', right: 20, bottom: 'calc(64px + var(--player-h, 0px) + env(safe-area-inset-bottom) + 16px)', zIndex: 'appBar',
    }}>
      <AddIcon />
    </Fab>
  );

  const snackbar = (
    <Snackbar open={!!undo} autoHideDuration={6000} onClose={() => setUndo(null)} message="Note mise à la corbeille"
      action={<Button color="secondary" onClick={() => void restore()}>Annuler</Button>}
      sx={{ bottom: 'calc(64px + var(--player-h, 0px) + env(safe-area-inset-bottom) + 12px) !important' }} />
  );

  if (!wide) {
    return (
      <>
        {selected ? <NoteEditor key={selected} id={selected} onBack={() => (window.history.length > 1 ? window.history.back() : open(null))} onDeleted={onDeleted} /> : <>{list}{fab}</>}
        {snackbar}
      </>
    );
  }
  return (
    <>
      <Box sx={{
        display: 'grid', gridTemplateColumns: 'minmax(300px, 4fr) 6fr',
        height: 'calc(100dvh - 52px - 64px - var(--player-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      }}>
        <Box sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>{list}</Box>
        <Box sx={{ overflowY: 'auto' }}>
          {selected ? <NoteEditor key={selected} id={selected} onDeleted={onDeleted} /> : (
            <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: '100%', px: 4, textAlign: 'center' }}>
              <Typography sx={{ fontFamily: fonts.display, fontSize: '1.4rem' }}>Choisis une note, ou commence-en une</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => void newNote()}>Nouvelle note</Button>
            </Stack>
          )}
        </Box>
      </Box>
      {fab}
      {snackbar}
    </>
  );
}
