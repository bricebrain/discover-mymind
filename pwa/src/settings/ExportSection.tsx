import DownloadIcon from '@mui/icons-material/Download';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useDataExport } from './useDataExport';

export function ExportSection() {
  const exporter = useDataExport();
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h2" component="h2" sx={{ mb: 1 }}>Mes données</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Récupère tout ce qui t’appartient : tes notes (corbeille incluse) et leurs liens, tes contenus préparés avec
        leurs textes et traductions, tes dossiers, tes émissions et ta progression d’écoute — dans un JSON complet et
        un document Markdown lisible. Les audios ne sont pas inclus : l’export liste leurs empreintes et leurs tailles.
      </Typography>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => exporter.mutate(2)} disabled={exporter.isPending}>
          {exporter.isPending ? 'Préparation…' : 'Exporter tout (JSON + Markdown)'}
        </Button>
        <Button variant="outlined" onClick={() => exporter.mutate(1)} disabled={exporter.isPending}>
          Export historique (notes et émissions)
        </Button>
      </Stack>
      {exporter.data && <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
        <Button component="a" href={exporter.data.jsonUrl} download={`discover-export-${exporter.data.date}.json`}>Enregistrer le JSON</Button>
        {exporter.data.markdownUrl && <Button component="a" href={exporter.data.markdownUrl} download={`discover-export-${exporter.data.date}.md`}>Enregistrer le Markdown</Button>}
      </Stack>}
      {exporter.data?.partial && <Alert severity="warning" sx={{ mt: 1.5 }}>
        Certains textes sont indisponibles. Les fichiers exportés indiquent les éléments manquants ; réessaie l’export après vérification.
      </Alert>}
      {exporter.isError && <Alert severity="warning" sx={{ mt: 1.5 }}>Export impossible pour l’instant.</Alert>}
    </Box>
  );
}
