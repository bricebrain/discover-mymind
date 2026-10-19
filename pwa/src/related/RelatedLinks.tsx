import { FileText, Lightbulb, Podcast, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RelatedItem } from './api';
const ICONS = { article: FileText, note: Lightbulb, podcast: Podcast, youtube: Play };
const COLORS = { article: 'text-article', note: 'text-primary', podcast: 'text-foreground', youtube: 'text-youtube' };
export function RelatedLinks({ items }: { items: RelatedItem[] }) {
  return <ul className="m-0 list-none p-0">{items.map((item) => {
    const Icon = ICONS[item.sourceKind];
    return <li key={`${item.type}:${item.id}`}><Link to={item.href} className="flex min-h-11 items-center gap-3 py-2 text-sm text-foreground no-underline">
      <Icon aria-hidden className={`size-5 shrink-0 ${COLORS[item.sourceKind]}`} /><span className="min-w-0"><span className="block">{item.title}</span>
        <span className="text-xs text-muted-foreground">{item.publisher}</span></span>
    </Link></li>;
  })}</ul>;
}
