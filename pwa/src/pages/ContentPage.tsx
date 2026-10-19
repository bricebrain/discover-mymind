import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Notice, Spinner } from '@/components/ui/kit';
import { useContent } from '../api/contents';
import { unreviewed, VariantPills } from '../components/PreparedEpisode';
import { DeleteContentButton } from '../content/DeleteContentButton';
import { PlaybackControls } from '../content/VariantControls';
import { VersionLearning } from '../content/VersionLearning';
import { VariantTranscript } from '../content/VariantTranscript';
import { useContentReader } from '../content/useContentReader';
import { DossierSourcesList } from '../dossiers/DossierSourcesList';
import { DownloadButton } from '../offline/DownloadButton';

export function ContentPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { libraryLocation?: unknown } | null)?.libraryLocation;
  const libraryLocation = typeof from === 'string' && /^\/library(?:\?|$)/.test(from) ? from : '/library';
  const query = useContent(id);
  const reader = useContentReader(query.data);
  const variant = reader.variant;
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[760px] px-4 pb-8 pt-2">
    <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to={libraryLocation} className="no-underline"><ArrowLeft className="size-4" />Bibliothèque</Link></Button>
    {query.isPending && <div className="grid place-items-center py-10"><Spinner /></div>}
    {query.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>}
    {query.isSuccess && !variant && <Notice>Aucune version disponible pour ce contenu.</Notice>}
    {query.data && variant && <>
      <h1 className="m-0 mb-1 mt-3 font-display text-[2rem] font-normal leading-[1.1] tracking-tight">{query.data.content.title}</h1>
      {query.data.content.sources && <DossierSourcesList sources={query.data.content.sources} />}
      {reader.unavailableVersion && <Notice className="mt-3">La version demandée n’est plus disponible. Une version présente est affichée.</Notice>}
      <div className="mt-4"><VariantPills variants={query.data.variants} value={variant.key} onSelect={reader.select} /></div>
      {unreviewed(variant) && <Notice tone="warning" className="mb-3">
        Publiée automatiquement : le contrôle de fidélité a signalé des points à vérifier. Garde un œil critique sur les chiffres et les noms.
      </Notice>}
      <PlaybackControls reader={reader} />
      <DownloadButton detail={query.data} variant={variant} />
      <VariantTranscript key={`${query.data.publicationId}:${variant.key}`} detail={query.data} variant={variant}
        activePositionMs={reader.activePositionMs} verified={reader.verified} playing={reader.playing} onSeek={reader.play} />
      <VersionLearning key={`${query.data.publicationId}:${variant.key}`} detail={query.data} variant={variant} verified={reader.verified} onSeek={reader.play} />
      <div className="mt-6"><DeleteContentButton id={id} title={query.data.content.title} onDeleted={() => navigate(libraryLocation, { replace: true })} /></div>
    </>}
  </motion.div>;
}
