import PodcastsOutlinedIcon from '@mui/icons-material/PodcastsOutlined';
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORY_LABELS, type Category } from '../api/episodes';
import { EpisodeBrowser } from '../components/EpisodeBrowser';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export function ExplorerPage() {
  const [params, setParams] = useSearchParams();
  const category = (params.get('cat') as Category | null) ?? undefined;
  const lang = (params.get('lang') as 'fr' | 'en' | null) ?? undefined;

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('e');
    setParams(next, { replace: true });
  };

  const header = (
    <>
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h1" component="h1" sx={{ flex: 1 }}>Explorer</Typography>
        <Button component={Link} to="/shows" startIcon={<PodcastsOutlinedIcon />} size="small">Mes émissions</Button>
      </Stack>
      <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 1, mx: -1, px: 1, scrollbarWidth: 'none' }}>
        <Chip label="Tout" color={!category ? 'primary' : 'default'} onClick={() => setParam('cat', undefined)} />
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} color={category === c ? 'primary' : 'default'} onClick={() => setParam('cat', category === c ? undefined : c)} />
        ))}
      </Box>
      <ToggleButtonGroup size="small" exclusive value={lang ?? 'all'} onChange={(_e, v: string | null) => v && setParam('lang', v === 'all' ? undefined : v)}
        sx={{ mb: 1 }} aria-label="Langue">
        <ToggleButton value="all">Toutes</ToggleButton>
        <ToggleButton value="fr">Français</ToggleButton>
        <ToggleButton value="en">Anglais</ToggleButton>
      </ToggleButtonGroup>
    </>
  );

  return (
    <EpisodeBrowser
      filters={{ category, lang }}
      header={header}
      empty="Aucun épisode pour l’instant. Les émissions sont vérifiées à tour de rôle, environ toutes les 30 minutes."
    />
  );
}
