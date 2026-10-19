import { Link2, NotebookPen, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PillTabs, cardCls } from '@/components/ui/kit';
import { EpisodeBrowser } from '../components/EpisodeBrowser';
import { DossiersPanel } from '../dossiers/DossiersPanel';
import { PreparedContents } from '../library/PreparedContents';
import { DownloadsList } from '../offline/DownloadsList';
import { LIBRARY_VIEWS, useLibraryNavigation, type LibraryView } from '../library/useLibraryNavigation';
import { AddYoutubeDialog } from '../queue/AddYoutubeDialog';
import { PreparationPanel } from '../queue/PreparationPanel';
import { useNewNote } from './MindPage';

const VIEWS = Object.entries(LIBRARY_VIEWS) as [LibraryView, string][];

/** Bibliothèque : contenus préparés par l'Atelier, dossiers, file de préparation, sauvegardes et téléchargements. */
export function LibraryPage() {
  const navigation = useLibraryNavigation();
  const [adding, setAdding] = useState(false);
  const newNote = useNewNote();
  const prepared = navigation.view !== 'queue' && navigation.view !== 'saved' && navigation.view !== 'downloads';
  return <div className="mx-auto max-w-[960px] px-4 pb-6 pt-3">
    <h1 className="sr-only">Bibliothèque</h1>
    <div className="mb-3 grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setAdding(true)}
        className={`${cardCls} flex min-h-14 items-center gap-3 px-3 text-left transition-transform active:scale-[.98]`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-youtube-soft text-youtube"><Link2 className="size-[18px]" /></span>
        <span className="text-sm font-semibold leading-tight">Lien YouTube</span>
      </button>
      <button type="button" onClick={() => void newNote()}
        className={`${cardCls} flex min-h-14 items-center gap-3 px-3 text-left transition-transform active:scale-[.98]`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><NotebookPen className="size-[18px]" /></span>
        <span className="text-sm font-semibold leading-tight">Texte My Mind</span>
      </button>
    </div>
    <PillTabs id="library" label="Contenus de la bibliothèque" value={navigation.view} onChange={navigation.select} options={VIEWS} />
    <div role="tabpanel" aria-label={LIBRARY_VIEWS[navigation.view]} className="mt-3">
      {prepared && <>
        {navigation.view === 'dossier' && <DossiersPanel />}
        {navigation.view === 'reflection' && <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          Colle ou écris ton texte dans My Mind, puis choisis « Préparer en anglais » sous la note.{' '}
          <Button asChild variant="ghost" size="sm" className="text-primary"><Link to="/mind" className="no-underline">Ouvrir mes notes</Link></Button>
        </p>}
        <label className={`${cardCls} flex h-11 items-center gap-2 px-3.5`}>
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input type="text" inputMode="search" enterKeyHint="search" value={navigation.search} maxLength={200} aria-label="Rechercher un titre"
            placeholder="Rechercher un titre" onChange={(event) => navigation.setSearch(event.target.value)}
            className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        <PreparedContents filters={navigation.filters} />
      </>}
      {navigation.view === 'queue' && <PreparationPanel />}
      {navigation.view === 'downloads' && <DownloadsList />}
      {navigation.view === 'saved' && <EpisodeBrowser filters={{ state: 'saved' }}
        header={<h2 className="mb-2 mt-1 font-display text-[1.6rem] font-normal">Épisodes sauvegardés</h2>}
        empty="Les épisodes sauvegardés depuis Explorer apparaîtront ici." />}
    </div>
    {adding && <AddYoutubeDialog onClose={() => setAdding(false)} onQueued={() => navigation.select('queue')} />}
  </div>;
}
