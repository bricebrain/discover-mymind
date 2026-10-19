import { Alert, Box, Button, ButtonBase, CircularProgress, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useArticles, type ArticleFilters } from '../api/articles';
import { formatWhen } from '../api/episodes';
import { fonts } from '../app/theme';
import { ArticleCard } from './ArticleCard';
import { ArticleDetail } from './ArticleDetail';

/** Liste d'articles + lecture : côte à côte déplié (Fold7), lecture en plein écran plié. L'article ouvert est dans l'URL (?a=…). */
export function ArticleBrowser({ filters, header }: { filters: ArticleFilters; header: ReactNode }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const [params, setParams] = useSearchParams();
  const selected = params.get('a');
  const query = useArticles(filters);
  const articles = query.data?.pages.flatMap((p) => p.articles) ?? [];
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('a', id); else next.delete('a');
    setParams(next, { replace: wide });
  };
  const list = <Box sx={{ px: { xs: 1, sm: 1.5 }, pt: 2.5, pb: 4, maxWidth: 760, mx: 'auto' }}>
    <Box sx={{ px: 1 }}>{header}</Box>
    {query.isPending && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}
    {query.isError && <Alert severity="warning" sx={{ m: 1 }}>{query.error.message}</Alert>}
    {query.isSuccess && !articles.length && <Typography color="text.secondary" sx={{ px: 2, py: 6, textAlign: 'center', fontFamily: fonts.reading }}>
      Les articles de The Guardian, The Conversation et ProPublica arrivent au fil de l’heure.
    </Typography>}
    <Stack spacing={0.25} sx={{ animation: 'riseIn .3s ease-out' }}>
      {articles.map((a) => <ArticleCard key={a.id} article={a} selected={a.id === selected} onOpen={() => open(a.id)} />)}
    </Stack>
    {query.hasNextPage && <Box sx={{ textAlign: 'center', mt: 2 }}>
      <Button variant="outlined" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? 'Chargement…' : 'Plus d’articles'}</Button>
    </Box>}
  </Box>;
  if (!wide) return selected ? <ArticleDetail id={selected} onBack={() => (window.history.length > 1 ? window.history.back() : open(null))} /> : list;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 5fr) 6fr',
    height: 'calc(100dvh - 52px - 64px - var(--player-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}>
    <Box sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>{list}</Box>
    <Box sx={{ overflowY: 'auto' }}>
      {selected ? <ArticleDetail id={selected} /> : <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', px: 4, textAlign: 'center', color: 'text.secondary' }}>
        <Typography sx={{ fontFamily: fonts.display, fontSize: '1.4rem', mb: 1, color: 'text.primary' }}>Choisis un article</Typography>
        <Typography sx={{ maxWidth: 320 }}>Il s’affichera ici, avec la possibilité de le préparer en anglais.</Typography>
      </Stack>}
    </Box>
  </Box>;
}

/** Dans « Tout » : les derniers articles en bandeau horizontal, sous le titre d'Explorer. */
export function ArticlesStrip() {
  const query = useArticles({});
  const articles = (query.data?.pages[0]?.articles ?? []).slice(0, 8);
  if (!articles.length) return null;
  return <Box sx={{ mb: 1.5 }}>
    <Stack direction="row" alignItems="baseline" sx={{ mb: 0.75 }}>
      <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>Articles du jour</Typography>
      <Button size="small" component={Link} to="/?source=article">Tout voir</Button>
    </Stack>
    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mx: -1, px: 1, scrollSnapType: 'x mandatory', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      {articles.map((a) => <ButtonBase key={a.id} component={Link} to={`/?source=article&a=${a.id}`} sx={{
        flex: '0 0 230px', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left',
        p: 1.5, borderRadius: 4, border: 1, borderColor: 'divider', bgcolor: 'background.paper', minHeight: 112, '&:active': { transform: 'scale(.98)' },
      }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'secondary.main' }} noWrap>{a.publisher} · {formatWhen(a.publishedAt)}</Typography>
        <Typography sx={{ fontWeight: 650, lineHeight: 1.3, mt: 0.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</Typography>
      </ButtonBase>)}
    </Box>
  </Box>;
}
