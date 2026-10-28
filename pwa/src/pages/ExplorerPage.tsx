import { motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORY_LABELS, type Category } from '../api/episodes';
import { useShows } from '../api/shows';
import { categoryColor } from '../app/theme';
import { ExplorerFeed } from '../explorer/ExplorerFeed';
import { cn } from '@/lib/utils';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
type Source = 'all' | 'youtube' | 'article';
const SOURCES: [Source, string][] = [['all', 'Tout'], ['youtube', 'YouTube'], ['article', 'Articles']];

/** Sélecteur segmenté de la maquette : la pastille blanche glisse vers le choix actif (Motion). */
function Segmented({ value, onChange }: { value: Source; onChange: (s: Source) => void }) {
  return <div role="tablist" aria-label="Type de contenu" className="grid h-10 grid-cols-3 rounded-xl bg-muted p-1">
    {SOURCES.map(([id, label]) => {
      const on = id === value;
      return <button key={id} type="button" role="tab" aria-selected={on} onClick={() => onChange(id)}
        className={cn('relative rounded-[9px] text-[13px] font-semibold transition-colors', on ? 'text-foreground' : 'text-muted-foreground')}>
        {on && <motion.span layoutId="explorer-segment" className="absolute inset-0 rounded-[9px] bg-card shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.04)]"
          transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
        <span className="relative">{label}</span>
      </button>;
    })}
  </div>;
}

function Chip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors active:scale-95',
      active ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted')}
    style={active && color ? { background: `${color}1f`, color } : undefined}>
    {color && <span className="size-2 rounded-full" style={{ background: color }} />}{label}
  </button>;
}

/** Explorer : vidéos YouTube et articles dans un même fil, filtrables par type, catégorie et langue. */
export function ExplorerPage() {
  const shows = useShows();
  const [params, setParams] = useSearchParams();
  const raw = params.get('source');
  const source: Source = raw === 'youtube' || raw === 'article' ? raw : 'all';
  const show = params.get('show') ?? undefined;
  const category = (params.get('cat') as Category | null) ?? undefined;
  const lang = (params.get('lang') as 'fr' | 'en' | null) ?? undefined;

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('e'); next.delete('a');
    if (key === 'source') next.delete('show');
    setParams(next, { replace: true });
  };

  // Titre et accès aux abonnements sont dans la barre du haut : le fil commence directement par les filtres.
  const header = <div className="mb-2">
    <h1 className="sr-only">Explorer</h1>
    <Button component={Link} to="/research" size="small" sx={{ mb: 1 }}>Recherches · Articles Gemini</Button>
    <Segmented value={source} onChange={(s) => setParam('source', s === 'all' ? undefined : s)} />
    {source === 'youtube' && <select value={show ?? ''} onChange={(e) => setParam('show', e.target.value || undefined)} aria-label="Chaîne YouTube"
      className="mt-3 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground">
      <option value="">Toutes les chaînes</option>
      {(shows.data?.shows ?? []).filter((s) => s.sourceType === 'youtube' && s.enabled).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
    </select>}
    {source !== 'article' && <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Chip label="Tout" active={!category} onClick={() => setParam('cat', undefined)} />
      {CATEGORIES.map((c) => <Chip key={c} label={CATEGORY_LABELS[c]} color={categoryColor(c, 'light')} active={category === c}
        onClick={() => setParam('cat', category === c ? undefined : c)} />)}
    </div>}
    <div role="radiogroup" aria-label="Langue" className="mt-2 flex gap-4">
      {([['all', 'Toutes langues'], ['fr', 'Français'], ['en', 'Anglais']] as const).map(([v, l]) => {
        const on = (lang ?? 'all') === v;
        return <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setParam('lang', v === 'all' ? undefined : v)}
          className={cn('border-b-2 py-1 text-[13px] transition-colors', on ? 'border-article font-bold text-foreground' : 'border-transparent font-medium text-muted-foreground')}>{l}</button>;
      })}
    </div>
  </div>;

  return <ExplorerFeed
    filters={{ category, lang, sourceType: source === 'youtube' ? source : undefined, show }}
    withEpisodes={source !== 'article'}
    withArticles={(source === 'all' || source === 'article') && !category && !show}
    showResume={source === 'all' && !category && !lang}
    header={header}
    empty={source === 'article' ? 'Les articles de The Guardian, The Conversation et ProPublica arrivent au fil de l’heure.'
      : 'Aucun contenu pour l’instant. Ajoute une chaîne YouTube dans Abonnements.'} />;
}
