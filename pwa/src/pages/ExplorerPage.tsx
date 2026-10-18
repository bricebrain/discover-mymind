import PodcastsOutlinedIcon from '@mui/icons-material/PodcastsOutlined';
import { Box, Button, ButtonBase, Stack, TextField, MenuItem, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORY_LABELS, type Category } from '../api/episodes';
import { useShows } from '../api/shows';
import { categoryColor } from '../app/theme';
import { EpisodeBrowser } from '../components/EpisodeBrowser';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const todayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <ButtonBase onClick={onClick} aria-pressed={active} sx={(t) => ({
      flexShrink: 0, height: 34, px: 1.5, borderRadius: 999, gap: 0.75, fontWeight: 600, fontSize: '0.85rem',
      border: 1, borderColor: active ? 'transparent' : 'divider',
      bgcolor: active ? (color ? alpha(color, t.palette.mode === 'light' ? 0.14 : 0.22) : 'text.primary') : 'transparent',
      color: active ? (color ?? t.palette.background.default) : 'text.primary', transition: 'background-color .2s',
    })}>
      {color && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />}
      {label}
    </ButtonBase>
  );
}

export function ExplorerPage() {
  const theme = useTheme();
  const shows = useShows();
  const [params, setParams] = useSearchParams();
  const show = params.get('show') ?? undefined;
  const category = (params.get('cat') as Category | null) ?? undefined;
  const sourceType = params.get('source') === 'youtube' ? 'youtube' : params.get('source') === 'podcast' ? 'podcast' : undefined;
  const lang = (params.get('lang') as 'fr' | 'en' | null) ?? undefined;

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('e');
    if (key === 'source') next.delete('show');
    setParams(next, { replace: true });
  };

  const today = todayFmt.format(new Date());
  const header = (
    <>
      <Stack direction="row" alignItems="flex-end" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" color="text.secondary">{today}</Typography>
          <Typography variant="h1" component="h1">Explorer</Typography>
        </Box>
        <Button component={Link} to="/shows" startIcon={<PodcastsOutlinedIcon />} size="small" variant="outlined" sx={{ mb: 0.5 }}>
          Abonnements
        </Button>
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }} aria-label="Type de source">
        <FilterChip label="Tout" active={!sourceType} onClick={() => setParam('source', undefined)} />
        <FilterChip label="Podcasts" active={sourceType === 'podcast'} onClick={() => setParam('source', 'podcast')} />
        <FilterChip label="YouTube" active={sourceType === 'youtube'} onClick={() => setParam('source', 'youtube')} />
      </Stack>
      {sourceType === 'youtube' && <TextField select fullWidth size="small" label="Chaîne YouTube" value={show ?? ''}
        onChange={(e) => setParam('show', e.target.value || undefined)} sx={{ mb: 1.5 }}>
        <MenuItem value="">Toutes les chaînes</MenuItem>
        {(shows.data?.shows ?? []).filter((s) => s.sourceType === 'youtube' && s.enabled).map((s) => <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>)}
      </TextField>}
      <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 1, mx: -1, px: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        <FilterChip label="Tout" active={!category} onClick={() => setParam('cat', undefined)} />
        {CATEGORIES.map((c) => (
          <FilterChip key={c} label={CATEGORY_LABELS[c]} color={categoryColor(c, theme.palette.mode)} active={category === c}
            onClick={() => setParam('cat', category === c ? undefined : c)} />
        ))}
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 0.5, mb: 0.5 }} role="radiogroup" aria-label="Langue">
        {([['all', 'Toutes langues'], ['fr', 'Français'], ['en', 'Anglais']] as const).map(([v, l]) => {
          const on = (lang ?? 'all') === v;
          return (
            <ButtonBase key={v} role="radio" aria-checked={on} onClick={() => setParam('lang', v === 'all' ? undefined : v)} sx={{
              py: 0.5, fontSize: '0.85rem', fontWeight: on ? 700 : 500, color: on ? 'text.primary' : 'text.secondary',
              borderBottom: 2, borderColor: on ? 'secondary.main' : 'transparent',
            }}>{l}</ButtonBase>
          );
        })}
      </Stack>
    </>
  );

  return (
    <EpisodeBrowser
      filters={{ category, lang, sourceType, show }}
      header={header}
      showResume={!category && !lang && sourceType !== 'youtube'}
      empty="Aucun contenu pour l’instant. Ajoute un podcast ou une chaîne YouTube dans Abonnements. Les sources sont vérifiées à tour de rôle."
    />
  );
}
