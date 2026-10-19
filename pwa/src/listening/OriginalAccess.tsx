import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { ContentDetail, ContentSegment, ContentVariant } from '../api/contents';
import { fonts } from '../app/theme';
import { sourceLink, sourcesForSegment, useDossierPassages } from '../dossiers/SegmentSources';
import { useOriginalPassage, type Original } from './useOriginal';

export interface OriginalMenuState { segment: ContentSegment; anchor: HTMLElement }

/**
 * I3 — accès à l'original depuis un paragraphe de version adaptée.
 * Le bouton (et l'appui long sur le paragraphe) ouvrent un menu : écouter l'original au premier
 * passage cité si son horodatage est fiable, sinon lire le texte de ces passages, et pour un
 * dossier multisources, ouvrir les sources d'origine comme le font les pastilles.
 */
export function OriginalButton({ segment, onOpen }: { segment: ContentSegment; onOpen: (state: OriginalMenuState) => void }) {
  if (!segment.sourceSegments?.length) return null;
  return <Tooltip title="Original de ce passage">
    <IconButton size="small" aria-label={`Original du passage : ${segment.text.slice(0, 60)}${segment.text.length > 60 ? '…' : ''}`}
      onClick={(e) => onOpen({ segment, anchor: e.currentTarget })} sx={{ mt: 0.5, color: 'text.secondary' }}>
      <MoreVertIcon fontSize="small" />
    </IconButton>
  </Tooltip>;
}

export function OriginalMenu({ detail, variant, original, state, onClose }: {
  detail: ContentDetail; variant: ContentVariant; original: Original;
  state: OriginalMenuState | null; onClose: () => void;
}) {
  const [reading, setReading] = useState<ContentSegment[] | null>(null);
  const passages = useDossierPassages(detail);
  const { cited, listenable, jump } = useOriginalPassage(detail, variant, original, state?.segment);
  const sources = state ? sourcesForSegment(state.segment, passages ?? new Map()) : [];

  return <>
    <Menu anchorEl={state?.anchor ?? null} open={!!state} onClose={onClose} MenuListProps={{ 'aria-label': 'Actions sur le passage' }}>
      {original.doc.isPending && <MenuItem disabled><ListItemText>Chargement de l’original…</ListItemText></MenuItem>}
      {original.doc.isError && <>
        <MenuItem disabled><ListItemText>L’original n’a pas pu être chargé.</ListItemText></MenuItem>
        <MenuItem onClick={() => void original.doc.refetch()}><ListItemText>Réessayer</ListItemText></MenuItem>
      </>}
      {original.doc.isSuccess && listenable && <MenuItem onClick={() => { if (jump()) onClose(); }} aria-label="Écouter l’original ici">
        <ListItemText primary="Écouter l’original ici" secondary="Original, dès le premier passage cité" />
      </MenuItem>}
      {original.doc.isSuccess && !listenable && cited.length > 0
        && <MenuItem onClick={() => { setReading(cited); onClose(); }}><ListItemText primary="Lire le passage original" /></MenuItem>}
      {original.doc.isSuccess && !listenable && !cited.length && <MenuItem disabled><ListItemText>Aucun passage original connu.</ListItemText></MenuItem>}
      {sources.map((p) => (
        <MenuItem key={p.source.id} component={Link} to={sourceLink(p.source)} onClick={onClose}>
          <ListItemText primary={`Ouvrir la source : ${p.source.title}`} />
        </MenuItem>
      ))}
    </Menu>
    <Dialog open={reading !== null} onClose={() => setReading(null)} maxWidth="sm" fullWidth
      aria-labelledby="original-passages-title">
      <DialogTitle id="original-passages-title">Passage original</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {original.source?.audio
            ? 'L’audio original n’est pas synchronisé de façon fiable : le passage est montré en texte, sans instant inventé.'
            : 'L’original de ce contenu est disponible en texte seul.'}
        </Typography>
        <Stack spacing={1.5}>
          {reading?.map((s) => <Box key={s.id}>
            {s.speaker && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{s.speaker}</Typography>}
            <Typography lang={original.source?.language} sx={{ fontFamily: fonts.reading, fontSize: '1.05rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{s.text}</Typography>
            {!!s.fr?.trim() && <Typography lang="fr" variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{s.fr}</Typography>}
          </Box>)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setReading(null)}>Fermer</Button>
      </DialogActions>
    </Dialog>
  </>;
}
