import { Box, Link as MuiLink, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { DossierSource } from '../api/contents';
import { sourceLink } from './SegmentSources';

const TYPES = { episode: 'Épisode', content: 'Contenu préparé', reflection: 'Note' } as const;

/** En tête d'une synthèse de dossier : les sources réellement traitées, dans l'ordre, avec un lien vers chacune. */
export function DossierSourcesList({ sources }: { sources: DossierSource[] }) {
  return <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 3, bgcolor: 'action.hover' }}>
    <Typography variant="overline" color="text.secondary">Synthèse de {sources.length} sources</Typography>
    <Box component="ol" sx={{ pl: 2.5, m: 0 }}>
      {sources.map((s) => <Typography component="li" variant="body2" key={s.id}>
        <MuiLink component={Link} to={sourceLink(s)} underline="hover">{s.title}</MuiLink>
        <Typography component="span" variant="caption" color="text.secondary"> · {TYPES[s.type]}</Typography>
      </Typography>)}
    </Box>
  </Box>;
}
