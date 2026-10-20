import { Headphones, Newspaper, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { formatWhen } from '../api/episodes';
import { Aurora } from '../vivid/Aurora';
import { publisherMark, type FeedItem } from './feed';

/**
 * « À la une » : les contenus les plus récents en grandes cartes plein cadre qui défilent au doigt.
 * Épisode : sa pochette, agrandie et floutée en fond ; article : la couleur de son journal sous une aurore.
 */
export function HeroCarousel({ items, onOpen }: { items: FeedItem[]; onOpen: (item: FeedItem) => void }) {
  if (items.length < 2) return null;
  return <section aria-label="À la une" className="mb-3 mt-4">
    <h2 className="m-0 mb-2 px-1 font-display text-[1.9rem] font-normal leading-none">À la une</h2>
    <div className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item, i) => {
        const episode = item.kind === 'episode' ? item.episode : null;
        const article = item.kind === 'article' ? item.article : null;
        const mark = article ? publisherMark(article.publisher) : null;
        const label = episode ? (episode.sourceType === 'youtube' ? 'YouTube' : 'Podcast') + ' · ' + episode.showTitle : `Article · ${article!.publisher}`;
        return <motion.button key={item.key} type="button" onClick={() => onOpen(item)} whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 190, damping: 24, delay: 0.05 + i * 0.07 }}
          className="relative flex h-[228px] w-[84%] max-w-[420px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[28px] p-4 text-left text-white shadow-[0_22px_44px_-22px_rgb(0_0_0/0.6)]"
          style={{ background: mark?.bg ?? '#0d3b36' }}>
          {episode?.imageUrl
            ? <img src={episode.imageUrl} alt="" className="art-breathe absolute inset-0 size-full object-cover opacity-90 blur-[2px]" style={{ animationDelay: `${-i * 3}s` }} />
            : <><Aurora intensity={0.7} /><span aria-hidden className="absolute right-4 top-3 font-display text-[5.5rem] leading-none opacity-25">{mark?.mark}</span></>}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/0" />
          <span className="relative mb-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md">
            {episode ? <Headphones className="size-3.5" /> : <Newspaper className="size-3.5" />}{label.length > 34 ? `${label.slice(0, 33)}…` : label}
          </span>
          <span className={cn('relative line-clamp-3 font-display text-[1.65rem] leading-[1.08] tracking-tight')}>{episode?.title ?? article!.title}</span>
          <span className="relative mt-2 flex items-center gap-2 text-[13px] text-white/80">
            {formatWhen(item.date || null)}
            {episode && episode.sourceType !== 'youtube' && <span className="ml-auto grid size-10 place-items-center rounded-full bg-white text-[#18181b]"><Play className="ml-0.5 size-4 fill-current" /></span>}
          </span>
        </motion.button>;
      })}
    </div>
  </section>;
}
