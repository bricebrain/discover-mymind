import { PreparedContents } from '../library/PreparedContents';
import { Typography } from '@mui/material';
import { EpisodeBrowser } from '../components/EpisodeBrowser';
import { PreparationPanel } from '../queue/PreparationPanel';

/** Contenus préparés et épisodes sauvegardés ; filtres avancés et hors ligne au lot 11. */
export function LibraryPage() {
  return (
    <EpisodeBrowser
      filters={{ state: 'saved' }}
      header={<><Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>Bibliothèque</Typography><PreparedContents /><PreparationPanel /><Typography variant="h5" component="h2" sx={{ mt: 3 }}>Épisodes sauvegardés</Typography></>}
      empty="Les épisodes que tu sauvegardes depuis Explorer sont rangés ici."
    />
  );
}
