import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PodcastsOutlinedIcon from '@mui/icons-material/PodcastsOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputBase,
  Stack, Tab, Tabs, Tooltip, Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { fonts } from '../app/theme';
import { renderMarkdown } from './markdown';
import { deleteDraft, draftFromNote, getDraft, pushDraft, putDraft, type Draft, type Note } from './store';

type Status = 'loading' | 'saved' | 'saving' | 'local' | 'offline' | 'conflict' | 'error' | 'missing';

const STATUS: Record<Exclude<Status, 'loading' | 'missing'>, { label: string; icon: ReactElement }> = {
  saved: { label: 'Synchronisée', icon: <CloudDoneOutlinedIcon fontSize="small" /> },
  saving: { label: 'Synchronisation…', icon: <SyncIcon fontSize="small" /> },
  local: { label: 'Enregistrée sur l’appareil', icon: <CloudDoneOutlinedIcon fontSize="small" /> },
  offline: { label: 'Hors ligne — enregistrée sur l’appareil', icon: <CloudOffOutlinedIcon fontSize="small" /> },
  conflict: { label: 'Modifiée ailleurs', icon: <WarningAmberIcon fontSize="small" /> },
  error: { label: 'Non synchronisée', icon: <WarningAmberIcon fontSize="small" /> },
};

const PUSH_DELAY = 1200;
const isEmpty = (d: Draft) => d.title.trim() === '' && d.body.trim() === '';

/**
 * Éditeur d'une note : chaque frappe est enregistrée sur l'appareil (immédiatement), puis envoyée au
 * Worker (1,2 s). Un seul envoi à la fois ; un conflit (409) est montré, jamais écrasé en silence.
 */
export function NoteEditor({ id, onBack, onDeleted }: { id: string; onBack?: () => void; onDeleted: (id: string, onServer: boolean) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [conflict, setConflict] = useState<Note | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const latest = useRef<Draft | null>(null);
  const timers = useRef<{ push?: number }>({});
  const inflight = useRef(false);
  const again = useRef(false);

  const push = useCallback(async () => {
    const d = latest.current;
    if (!d || !d.dirty || (d.baseUpdatedAt === null && isEmpty(d))) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    setStatus('saving');
    const r = await pushDraft(d);
    inflight.current = false;
    const now = latest.current;
    if (!now || now.id !== d.id) return;
    if (r.status === 'saved') {
      const changedMeanwhile = now.localUpdatedAt !== d.localUpdatedAt;
      const next: Draft = changedMeanwhile ? { ...now, baseUpdatedAt: r.note.updatedAt } : { ...draftFromNote(r.note), localUpdatedAt: now.localUpdatedAt };
      latest.current = next;
      setDraft(next);
      await putDraft(next);
      setStatus(changedMeanwhile ? 'local' : 'saved');
      void qc.invalidateQueries({ queryKey: ['reflections'] });
      if (changedMeanwhile || again.current) {
        again.current = false;
        void push();
      }
    } else if (r.status === 'conflict') {
      setConflict(r.current);
      setStatus('conflict');
    } else {
      setStatus(r.status === 'offline' ? 'offline' : 'error');
    }
  }, [qc]);

  // Chargement : le brouillon local non synchronisé l'emporte, sinon la version du serveur.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setConflict(null);
    setTab('write');
    (async () => {
      const local = await getDraft(id);
      const server = await api<{ reflection: Note }>(`/api/reflections/${id}`).then((r) => r.reflection).catch(() => null);
      if (!alive) return;
      let d: Draft | null = null;
      if (local && (local.dirty || !server)) d = local;
      else if (server) {
        d = draftFromNote(server);
        await putDraft(d);
      }
      latest.current = d;
      setDraft(d);
      setStatus(!d ? 'missing' : d.dirty ? 'local' : 'saved');
      if (d?.dirty) void push();
    })();
    return () => {
      alive = false;
    };
  }, [id, push]);

  // En quittant la note ou l'app : on écrit tout de suite sur l'appareil et on tente l'envoi.
  useEffect(() => {
    const flush = () => {
      const d = latest.current;
      if (!d) return;
      window.clearTimeout(timers.current.push);
      if (d.baseUpdatedAt === null && isEmpty(d)) {
        void deleteDraft(d.id);
        return;
      }
      void putDraft(d);
      void push();
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    const onOnline = () => latest.current?.dirty && void push();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', onOnline);
      flush();
    };
  }, [id, push]);

  const edit = (patch: Partial<Pick<Draft, 'title' | 'body'>>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch, dirty: true, localUpdatedAt: Date.now() };
    latest.current = next;
    setDraft(next);
    if (status !== 'conflict') setStatus('local');
    // Écriture immédiate sur l'appareil à chaque frappe : fermer l'app ne perd rien (IndexedDB est rapide).
    void putDraft(next);
    window.clearTimeout(timers.current.push);
    if (status !== 'conflict') timers.current.push = window.setTimeout(() => void push(), PUSH_DELAY);
  };

  const keepMine = () => {
    if (!latest.current || !conflict) return;
    latest.current = { ...latest.current, baseUpdatedAt: conflict.updatedAt, dirty: true };
    setConflict(null);
    void push();
  };
  const takeTheirs = async () => {
    if (!conflict) return;
    const d = draftFromNote(conflict);
    latest.current = d;
    setDraft(d);
    await putDraft(d);
    setConflict(null);
    setStatus('saved');
  };

  const remove = async () => {
    const d = latest.current;
    if (!d) return;
    const onServer = d.baseUpdatedAt !== null;
    latest.current = null;
    if (onServer) await api(`/api/reflections/${d.id}`, { method: 'DELETE' }).catch(() => {});
    await deleteDraft(d.id);
    void qc.invalidateQueries({ queryKey: ['reflections'] });
    onDeleted(d.id, onServer);
  };

  if (status === 'loading') return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={26} /></Box>;
  if (status === 'missing' || !draft) return <Alert severity="warning" sx={{ m: 2 }}>Note introuvable.</Alert>;
  const st = STATUS[status];

  return (
    <Box sx={{ px: 2, pt: onBack ? 1 : 3, pb: 6, maxWidth: 720, mx: 'auto', animation: 'riseIn .2s ease-out' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        {onBack && <IconButton onClick={onBack} aria-label="Retour aux notes" edge="start"><ArrowBackIcon /></IconButton>}
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: status === 'conflict' || status === 'error' ? 'warning.main' : 'text.secondary', flex: 1 }} role="status">
          {st.icon}
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{st.label}</Typography>
        </Stack>
        <Tooltip title="Mettre à la corbeille">
          <IconButton onClick={() => void remove()} aria-label="Mettre la note à la corbeille"><DeleteOutlineIcon /></IconButton>
        </Tooltip>
      </Stack>

      {draft.links.length > 0 && (
        <Stack spacing={0.75} sx={{ mb: 1.5 }}>
          {draft.links.map((l) => (
            <ButtonBase key={`${l.targetType}:${l.targetId}`} component={Link} to={l.targetType === 'episode' ? `/?e=${l.targetId}` : '/library'}
              sx={{ justifyContent: 'flex-start', gap: 1, px: 1.25, py: 0.75, borderRadius: 3, bgcolor: 'action.hover', color: 'text.secondary', textAlign: 'left' }}>
              <PodcastsOutlinedIcon fontSize="small" color="primary" />
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{l.targetTitle ?? 'Épisode'}</Typography>
            </ButtonBase>
          ))}
        </Stack>
      )}

      <InputBase
        value={draft.title}
        onChange={(e) => edit({ title: e.target.value })}
        placeholder="Titre (facultatif)"
        inputProps={{ 'aria-label': 'Titre de la note', maxLength: 200 }}
        fullWidth
        sx={{ fontFamily: fonts.display, fontSize: '1.7rem', fontWeight: 600, lineHeight: 1.2, mb: 1 }}
      />

      <Tabs value={tab} onChange={(_e, v: 'write' | 'preview') => setTab(v)} sx={{ mb: 1.5, minHeight: 36 }}>
        <Tab value="write" label="Écrire" sx={{ minHeight: 36 }} />
        <Tab value="preview" label="Aperçu" sx={{ minHeight: 36 }} />
      </Tabs>

      {tab === 'write' ? (
        <InputBase
          value={draft.body}
          onChange={(e) => edit({ body: e.target.value })}
          placeholder={'Écris librement… (Markdown simple : # titre, - liste, **gras**)'}
          inputProps={{ 'aria-label': 'Texte de la note', maxLength: 100_000 }}
          multiline
          minRows={12}
          fullWidth
          autoFocus={draft.baseUpdatedAt === null && isEmpty(draft)}
          sx={{ fontFamily: fonts.reading, fontSize: '1.08rem', lineHeight: 1.75, alignItems: 'flex-start' }}
        />
      ) : (
        <Box
          sx={{
            fontFamily: fonts.reading, fontSize: '1.08rem', lineHeight: 1.75,
            '& h2, & h3, & h4': { fontFamily: fonts.display, fontWeight: 600, lineHeight: 1.25, mt: 2.5, mb: 1 },
            '& a': { color: 'primary.main' }, '& code': { fontFamily: 'ui-monospace, monospace', fontSize: '0.9em', bgcolor: 'action.hover', px: 0.5, borderRadius: 1 },
            '& ul, & ol': { pl: 3 },
          }}
          // Rendu sûr : tout le HTML est échappé par renderMarkdown (§ 8.6).
          dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) || '<p style="opacity:.6">Rien à afficher.</p>' }}
        />
      )}

      <Dialog open={!!conflict}>
        <DialogTitle>Cette note a été modifiée ailleurs</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>Une autre version a été enregistrée depuis un autre appareil. Laquelle garder ?</Typography>
          <Typography variant="overline" color="text.secondary">L’autre version</Typography>
          <Typography sx={{ fontFamily: fonts.reading, whiteSpace: 'pre-line', maxHeight: 180, overflowY: 'auto', p: 1.5, borderRadius: 3, bgcolor: 'action.hover' }}>
            {conflict?.body || '(vide)'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void takeTheirs()}>Prendre l’autre version</Button>
          <Button variant="contained" onClick={keepMine}>Garder la mienne</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
