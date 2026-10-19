import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { validArticleUrl } from './articleUrl';
import type { Draft, NoteOrigin } from './store';


/**
 * Origine d'une note : « Ma réflexion » ou « Article ». Un article garde son journal et son lien : les préparations
 * et les dossiers l'attribuent à sa publication, jamais à toi.
 */
export function NoteOriginFields({ draft, onChange }: {
  draft: Draft; onChange: (patch: Partial<Pick<Draft, 'origin' | 'sourceName' | 'sourceUrl'>>) => void;
}) {
  const origin: NoteOrigin = draft.origin ?? 'personal';
  const url = draft.sourceUrl ?? '';
  const urlOk = validArticleUrl(url);
  return <Stack spacing={1.25} sx={{ mb: 1.5 }}>
    <ToggleButtonGroup size="small" exclusive value={origin} onChange={(_e, v: NoteOrigin | null) => v && onChange({ origin: v })} aria-label="Origine de la note">
      <ToggleButton value="personal"><LightbulbOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />Ma réflexion</ToggleButton>
      <ToggleButton value="article"><ArticleOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />Article</ToggleButton>
    </ToggleButtonGroup>
    {origin === 'article' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField size="small" label="Journal" placeholder="The Guardian" value={draft.sourceName ?? ''} inputProps={{ maxLength: 120 }}
        onChange={(e) => onChange({ sourceName: e.target.value })} sx={{ minWidth: 180 }} />
      <TextField size="small" label="Lien de l’article" placeholder="https://…" value={url} fullWidth error={!urlOk}
        helperText={urlOk ? undefined : 'Lien http(s) attendu.'} inputProps={{ maxLength: 2048, inputMode: 'url' }}
        onChange={(e) => onChange({ sourceUrl: e.target.value })}
        InputProps={{ endAdornment: url && urlOk ? <Tooltip title="Ouvrir l’article"><IconButton size="small" component="a" href={url.trim()} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l’article"><OpenInNewIcon fontSize="small" /></IconButton></Tooltip> : undefined }} />
    </Stack>}
  </Stack>;
}
