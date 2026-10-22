import { FolderOpen, Headphones, NotebookPen, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { usePreparedContents, type PreparedContent } from '../api/contents';
import { Aurora } from '../vivid/Aurora';

/** Fond de carte sans pochette : un dégradé par type de contenu. */
const TYPE_BG: Record<PreparedContent['sourceType'], { bg: string; label: string; Icon: typeof Play }> = {
  affaire: { bg: 'linear-gradient(140deg,#0d5f56,#123b5e)', label: 'À vous de juger', Icon: NotebookPen },
  podcast: { bg: 'linear-gradient(140deg,#0d5f56,#123b5e)', label: 'Podcast', Icon: Headphones },
  youtube: { bg: 'linear-gradient(140deg,#b91c1c,#7c1d3c)', label: 'YouTube', Icon: Play },
  reflection: { bg: 'linear-gradient(140deg,#0f766e,#0e9f8b)', label: 'Note My Mind', Icon: NotebookPen },
  dossier: { bg: 'linear-gradient(140deg,#4338ca,#7c3aed)', label: 'Dossier', Icon: FolderOpen },
};

export const contentLink = (c: PreparedContent) =>
  (c.sourceType === 'podcast' && /^podcast-[0-9a-f]{20}$/.test(c.id) ? `/?e=${c.id.slice(8)}` : `/library/${c.id}`);

/** « À écouter » : les derniers contenus préparés en grandes cartes, pochette en fond ou dégradé par type. */
export function ListenStrip() {
  const query = usePreparedContents({});
  const location = useLocation();
  const items = query.data?.pages[0]?.contents.slice(0, 6) ?? [];
  if (items.length < 2) return null;
  return <section aria-label="À écouter" className="mb-4">
    <h2 className="m-0 mb-2 font-display text-[1.9rem] font-normal leading-none">À écouter</h2>
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((c, i) => {
        const t = TYPE_BG[c.sourceType];
        return <motion.div key={c.id} className="w-[70%] max-w-[300px] shrink-0 snap-start"
          initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 190, damping: 24, delay: 0.05 + i * 0.07 }} whileTap={{ scale: 0.97 }}>
          <Link to={contentLink(c)} state={{ libraryLocation: location.pathname + location.search }}
            className="relative flex h-[190px] flex-col justify-end overflow-hidden rounded-[26px] p-3.5 text-white no-underline shadow-[0_20px_40px_-22px_rgb(0_0_0/0.6)]"
            style={{ background: t.bg }}>
            {c.imageUrl
              ? <img src={c.imageUrl} alt="" className="art-breathe absolute inset-0 size-full object-cover" style={{ animationDelay: `${-i * 3}s` }} />
              : <Aurora intensity={0.45} />}
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/0" />
            <span className="relative mb-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md">
              <t.Icon className="size-3.5" />{t.label}
            </span>
            <span className="relative line-clamp-3 font-display text-[1.4rem] leading-[1.1]">{c.title}</span>
            <span className="relative mt-1.5 text-[12px] text-white/75">{c.variantCount} version{c.variantCount > 1 ? 's' : ''} · {c.originalLanguage.toUpperCase()}</span>
          </Link>
        </motion.div>;
      })}
    </div>
  </section>;
}
