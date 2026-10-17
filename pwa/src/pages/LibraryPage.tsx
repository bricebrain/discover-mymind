import { Typography } from '@mui/material';
import { EpisodeBrowser } from '../components/EpisodeBrowser';

/** Bibliothèque (lot 2) : les épisodes sauvegardés. Contenus préparés, filtres et hors ligne : lot 11. */
export function LibraryPage() {
  return (
    <EpisodeBrowser
      filters={{ state: 'saved' }}
      header={<Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>Bibliothèque</Typography>}
      empty="Les épisodes que tu sauvegardes depuis Explorer sont rangés ici."
    />
  );
}
