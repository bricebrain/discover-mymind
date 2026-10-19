import { ExternalLink, FileText, Lightbulb } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { inputCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { validArticleUrl } from './articleUrl';
import type { Draft, NoteOrigin } from './store';

const ORIGINS = [['personal', 'Ma réflexion', Lightbulb], ['article', 'Article', FileText]] as const;

/**
 * Origine d'une note : « Ma réflexion » ou « Article ». Un article garde son journal et son lien : les préparations
 * et les dossiers l'attribuent à sa publication, jamais à toi.
 */
export function NoteOriginFields({ draft, onChange, children }: {
  draft: Draft; onChange: (patch: Partial<Pick<Draft, 'origin' | 'sourceName' | 'sourceUrl'>>) => void; children?: ReactNode;
}) {
  const origin: NoteOrigin = draft.origin ?? 'personal';
  const url = draft.sourceUrl ?? '';
  const urlOk = validArticleUrl(url);
  return <div className="mb-3 flex flex-col gap-2.5">
    <div role="radiogroup" aria-label="Origine de la note" className="inline-grid w-fit grid-cols-2 rounded-xl bg-muted p-1">
      {ORIGINS.map(([v, label, Icon]) => {
        const on = v === origin;
        return <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange({ origin: v })}
          className={cn('relative flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold transition-colors', on ? 'text-foreground' : 'text-muted-foreground')}>
          {on && <motion.span layoutId={`origin-${draft.id}`} className="absolute inset-0 rounded-[9px] bg-card shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.04)]" />}
          <Icon className={cn('relative size-4', on && (v === 'article' ? 'text-article' : 'text-primary'))} /><span className="relative">{label}</span>
        </button>;
      })}
    </div>
    {origin === 'article' && <div className="flex flex-col gap-2 sm:flex-row">
      <input className={cn(inputCls, 'sm:w-48')} aria-label="Journal" placeholder="Journal (ex. The Guardian)" value={draft.sourceName ?? ''} maxLength={120}
        onChange={(e) => onChange({ sourceName: e.target.value })} />
      <div className="flex-1">
        <div className="relative">
          <input className={cn(inputCls, url && urlOk && 'pr-11', !urlOk && 'border-red-300')} aria-label="Lien de l’article" placeholder="Lien de l’article (https://…)"
            value={url} maxLength={2048} inputMode="url" aria-invalid={!urlOk} onChange={(e) => onChange({ sourceUrl: e.target.value })} />
          {url && urlOk && <a href={url.trim()} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l’article" title="Ouvrir l’article"
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><ExternalLink className="size-4" /></a>}
        </div>
        {!urlOk && <p className="m-0 mt-1 text-xs text-red-700">Lien http(s) attendu.</p>}
      </div>
    </div>}
    {children}
  </div>;
}
