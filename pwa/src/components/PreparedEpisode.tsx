import { Alert, Box, Button, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useContent, type ContentVariant } from '../api/contents';
import { DeleteContentButton } from '../content/DeleteContentButton';
import { PlaybackControls } from '../content/VariantControls';
import { DownloadButton } from '../offline/DownloadButton';
import { VariantTranscript } from '../content/VariantTranscript';
import { useContentReader } from '../content/useContentReader';
import { durationLabel, languageName, variantName } from '../content/variants';

/** Les versions préparées d'abord (ce qu'on vient chercher), l'original en dernier. */
const order = (v: ContentVariant) => (v.kind === 'adaptation' ? 0 : v.kind === 'faithful_translation' ? 1 : 2);

/** Une évaluation publiée sans relecture et avec des points signalés. */
function unreviewed(v: ContentVariant): boolean {
  const e = (v as ContentVariant & { evaluation?: { verdict?: string; acceptedByUser?: boolean } }).evaluation;
  return !!e && e.verdict !== undefined && e.verdict !== 'ok' && e.acceptedByUser !== true;
}

/**
 * Versions préparées d'un épisode, directement dans son détail (Explorer ou Bibliothèque) :
 * pastilles de version, écoute de la version choisie, transcription synchronisée. Rien ne change de page.
 */
export function PreparedEpisode({ contentId, about, onDeleted }: { contentId: string; about: ReactNode; onDeleted?: () => void }) {
  const query = useContent(contentId);
  const reader = useContentReader(query.data);
  const variant = reader.variant;

  if (query.isPending) return <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={26} aria-label="Chargement des versions" /></Box>;
  if (query.isError) return <Alert severity="warning" action={<Button onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Alert>;
  if (!variant) return <Alert severity="info">Aucune version disponible pour cet épisode.</Alert>;
  const variants = [...query.data.variants].sort((a, b) => order(a) - order(b));

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">Versions</Typography>
      <Box role="radiogroup" aria-label="Version à écouter" sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 1.5, mx: -0.5, px: 0.5, scrollbarWidth: 'none' }}>
        {variants.map((v) => {
          const on = v.key === variant.key;
          return (
            <ButtonBase key={v.key} role="radio" aria-checked={on} onClick={() => reader.select(v.key)} sx={(t) => ({
              flexShrink: 0, flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', px: 1.75, py: 1, borderRadius: 3.5, minWidth: 128,
              border: 1.5, borderColor: on ? 'primary.main' : 'divider',
              bgcolor: on ? alpha(t.palette.primary.main, t.palette.mode === 'light' ? 0.08 : 0.16) : 'transparent', transition: 'all .2s',
            })}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: on ? 'primary.main' : 'text.primary' }}>{variantName(v)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {languageName(v.language)} · {v.audio ? durationLabel(v.audio.durationMs) : 'texte seul'}
              </Typography>
              {unreviewed(v) && <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>non relue</Typography>}
            </ButtonBase>
          );
        })}
      </Box>

      {unreviewed(variant) && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Publiée automatiquement : le contrôle de fidélité a signalé des points à vérifier. Garde un œil critique sur les chiffres et les noms.
        </Alert>
      )}
      <PlaybackControls reader={reader} />
      <DownloadButton detail={query.data} variant={variant} />
      <VariantTranscript key={`${query.data.publicationId}:${variant.key}`} detail={query.data} variant={variant}
        activePositionMs={reader.activePositionMs} verified={reader.verified} playing={reader.playing} onSeek={reader.play} />
      <Box sx={{ mt: 2 }}><DeleteContentButton id={contentId} title={query.data.content.title} onDeleted={onDeleted} /></Box>
      {about && (
        <Stack sx={{ mt: 4 }}>
          <Typography variant="overline" color="text.secondary">À propos de l’épisode</Typography>
          {about}
        </Stack>
      )}
    </Box>
  );
}
