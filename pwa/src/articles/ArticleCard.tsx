import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ArticleSummary } from '../api/articles';
import { formatWhen } from '../api/episodes';

export const readingTime = (chars: number | null) => (chars ? `${Math.max(1, Math.round(chars / 1200))} min de lecture` : null);

/** Carte d'article dans Explorer : journal, date, titre, état (texte complet, version anglaise prête). */
export function ArticleCard({ article, selected, onOpen }: { article: ArticleSummary; selected?: boolean; onOpen: () => void }) {
  const time = readingTime(article.contentLength);
  return <ButtonBase onClick={onOpen} aria-current={selected ? 'true' : undefined} sx={(t) => ({
    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, borderRadius: 4,
    bgcolor: selected ? 'action.selected' : 'transparent', '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
    transition: 'background-color .2s', '&:active': { transform: 'scale(.99)' },
    '& .badge': { bgcolor: alpha(t.palette.secondary.main, t.palette.mode === 'light' ? .12 : .22) },
  })}>
    <Box sx={{ width: 52, height: 52, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
      <ArticleOutlinedIcon color="action" />
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div" noWrap>
        <Box component="span" sx={{ fontWeight: 700, color: 'secondary.main' }}>{article.publisher}</Box>
        {' · '}{formatWhen(article.publishedAt)}{time ? ` · ${time}` : ''}
      </Typography>
      <Typography sx={{ fontWeight: 650, lineHeight: 1.3, mt: 0.25 }}>{article.title}</Typography>
      <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
        <Typography className="badge" variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 99, fontWeight: 650, color: 'secondary.main' }}>Article · {article.language.toUpperCase()}</Typography>
        {article.contentId && <Typography variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 99, fontWeight: 650, bgcolor: 'primary.main', color: 'primary.contrastText' }}>Version anglaise prête</Typography>}
      </Stack>
    </Box>
  </ButtonBase>;
}
