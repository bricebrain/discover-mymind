import AddLinkIcon from '@mui/icons-material/AddLink';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { Box, Button, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EpisodeBrowser } from '../components/EpisodeBrowser';
import { DossiersPanel } from '../dossiers/DossiersPanel';
import { PreparedContents } from '../library/PreparedContents';
import { LIBRARY_VIEWS, useLibraryNavigation, type LibraryView } from '../library/useLibraryNavigation';
import { AddYoutubeDialog } from '../queue/AddYoutubeDialog';
import { PreparationPanel } from '../queue/PreparationPanel';
import { useNewNote } from './MindPage';

export function LibraryPage() {
  const navigation = useLibraryNavigation();
  const [adding, setAdding] = useState(false);
  const newNote = useNewNote();
  const prepared = navigation.view !== 'queue' && navigation.view !== 'saved';
  return <Box sx={{ maxWidth: 960, mx: 'auto', px: 2, pt: 3, pb: 4 }}>
    <Typography variant="h1" component="h1">Bibliothèque</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>Retrouve tes vidéos, tes notes et tes podcasts préparés.</Typography>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
      <Button variant="contained" startIcon={<AddLinkIcon />} onClick={() => setAdding(true)}>Lien YouTube</Button>
      <Button variant="outlined" startIcon={<EditNoteIcon />} onClick={() => void newNote()}>Texte My Mind</Button>
    </Stack>
    <Tabs value={navigation.view} onChange={(_event, view: LibraryView) => navigation.select(view)} variant="scrollable" scrollButtons="auto"
      allowScrollButtonsMobile aria-label="Contenus de la bibliothèque" sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
      {Object.entries(LIBRARY_VIEWS).map(([value, label]) => <Tab key={value} id={`library-tab-${value}`} aria-controls="library-panel" value={value} label={label} />)}
    </Tabs>
    <Box role="tabpanel" id="library-panel" aria-labelledby={`library-tab-${navigation.view}`}>
      {prepared && <>
        {navigation.view === 'dossier' && <DossiersPanel />}
        {navigation.view === 'reflection' && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Colle ou écris ton texte dans My Mind, puis choisis « Préparer en anglais » sous la note.
          {' '}<Button component={Link} to="/mind" size="small">Ouvrir mes notes</Button>
        </Typography>}
        <TextField fullWidth size="small" label="Rechercher un titre" value={navigation.search} inputProps={{ maxLength: 200 }}
          onChange={(event) => navigation.setSearch(event.target.value)} />
        <PreparedContents filters={navigation.filters} />
      </>}
      {navigation.view === 'queue' && <PreparationPanel />}
      {navigation.view === 'saved' && <EpisodeBrowser filters={{ state: 'saved' }}
        header={<Typography variant="h5" component="h2">Épisodes sauvegardés</Typography>}
        empty="Les épisodes sauvegardés depuis Explorer apparaîtront ici." />}
    </Box>
    {adding && <AddYoutubeDialog onClose={() => setAdding(false)} onQueued={() => navigation.select('queue')} />}
  </Box>;
}
