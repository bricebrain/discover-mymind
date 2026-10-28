import { Alert, Box, Link, Stack, Typography } from '@mui/material';
import type { ResearchArticle } from '../api/research';
import { ResearchTheme } from './ResearchTheme';

export function ResearchArticleBody({ article }: { article: ResearchArticle }) {
  return <ResearchTheme><Stack spacing={3} lang="fr">
    <Alert severity="info">Synthèse assistée par IA à partir des sources citées. Les résultats et les annonces sont à lire avec leurs limites.</Alert>
    {article.sections.map((section, index) => <Box component="section" key={index}>
      <Typography component="h3" variant="h6" gutterBottom>{section.heading}</Typography>
      <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{section.text}</Typography>
      <Typography variant="caption" component="div" sx={{ mt: 1 }}>
        Sources : {section.sourceIds.map((id, i) => {
          const source = article.sources.find(s => s.id === id);
          return source && <span key={id}>{i > 0 && ' · '}<Link href={source.url} target="_blank" rel="noopener noreferrer">{id}</Link></span>;
        })}
      </Typography>
    </Box>)}
    <Box component="section" aria-label="Sources documentaires">
      <Typography component="h3" variant="h6" gutterBottom>Sources documentaires</Typography>
      <Stack spacing={1}>{article.sources.map(source => <Link key={source.id} href={source.url} target="_blank" rel="noopener noreferrer"
        sx={{ overflowWrap: 'anywhere' }}>{source.id} — {source.title} · {new URL(source.url).hostname}</Link>)}</Stack>
    </Box>
    {article.searchHtml && <Box>
      <Typography variant="caption" component="p">Recherche documentaire avec Google Search</Typography>
      {/* HTML d'attribution Google isolé : aucun script ni accès au document parent. */}
      <Box component="iframe" title="Suggestions de recherche Google" srcDoc={article.searchHtml}
        sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" sx={{ width: '100%', height: 180, border: 0, bgcolor: '#fff' }} />
    </Box>}
  </Stack></ResearchTheme>;
}
