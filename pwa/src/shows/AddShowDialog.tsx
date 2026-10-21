import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, Select, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, formatDuration, formatWhen, type Category } from '../api/episodes';
import { useCreateShow, useResolveShow, type ShowPreview } from '../api/shows';

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [Category, string][];
const LANGUAGE_OPTIONS = [['fr', 'Français'], ['en', 'Anglais']] as const;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Une erreur est survenue.';

/** Ajout d'une chaîne YouTube : lien ou @identifiant → aperçu → réglages → suivre. */
export function AddShowDialog({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ShowPreview | null>(null);
  const [category, setCategory] = useState<Category>('news');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [filter, setFilter] = useState('');
  const resolve = useResolveShow();
  const create = useCreateShow();

  const showPreview = (p: ShowPreview) => {
    setPreview(p);
    setLanguage(p.language ?? 'fr');
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    setPreview(null);
    resolve.mutate(input, { onSuccess: (r) => showPreview(r.preview) });
  };
  const follow = () => {
    if (!preview) return;
    const keywords = filter.split(',').map((k) => k.trim()).filter(Boolean);
    create.mutate(
      { feedUrl: preview.feedUrl, title: preview.title, publisher: preview.publisher, imageUrl: preview.imageUrl,
        sourceType: preview.sourceType, channelId: preview.channelId,
        language, category, titleFilter: keywords.length ? keywords : null },
      { onSuccess: onClose },
    );
  };
  const busy = resolve.isPending;

  return <Sheet wide title={preview ? 'Suivre cette chaîne' : 'Ajouter une chaîne YouTube'} onClose={onClose} locked={create.isPending} footer={<>
    {preview && <Button variant="ghost" onClick={() => setPreview(null)}>Retour</Button>}
    <Button variant="ghost" onClick={onClose}>Annuler</Button>
    {preview && <Button onClick={follow} disabled={create.isPending}>{create.isPending ? 'Ajout…' : 'Suivre'}</Button>}
  </>}>
    {!preview && <>
      <form onSubmit={search} className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Lien de chaîne YouTube ou @identifiant</span>
        <div className="flex gap-2">
          <span className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus type="text" inputMode="search" enterKeyHint="search" aria-label="Lien de chaîne YouTube ou @identifiant"
              className={cn(inputCls, 'pl-9')} value={input} onChange={(e) => setInput(e.target.value)} />
          </span>
          <Button type="submit" disabled={input.trim().length < 2 || busy}>Chercher</Button>
        </div>
        <span className="text-xs text-muted-foreground">Par exemple youtube.com/@arte ou @arte.</span>
      </form>
      {busy && <div className="grid place-items-center p-4"><Spinner /></div>}
      {resolve.isError && <Notice tone="warning">{errorText(resolve.error)}</Notice>}
    </>}

    {preview && <>
      <div className="flex items-center gap-4">
        {preview.imageUrl ? <img src={preview.imageUrl} alt="" className="size-[72px] shrink-0 rounded-2xl bg-muted object-cover" /> : <span className="size-[72px] shrink-0 rounded-2xl bg-muted" />}
        <div className="min-w-0">
          <p className="m-0 text-[17px] font-semibold leading-snug">{preview.title}</p>
          <p className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {[preview.publisher, preview.medianMinutes ? `≈ ${preview.medianMinutes} min` : null,
              preview.episodesPerWeek ? `${preview.episodesPerWeek} vidéo(s) / semaine` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="rounded-2xl bg-muted p-3">
        <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Dernières vidéos</p>
        {preview.latest.map((ep) => <p key={ep.title} className="m-0 truncate text-sm leading-relaxed">
          {ep.title} <span className="text-xs text-muted-foreground">· {formatWhen(ep.publishedAt)} {formatDuration(ep.durationSec)}</span>
        </p>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Catégorie"><Select value={category} options={CATEGORY_OPTIONS} onChange={setCategory} /></Field>
        <Field label="Langue"><Select value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} /></Field>
      </div>
      <Field label="Filtre de titre (facultatif)" hint="Mots-clés séparés par des virgules, ex. PSG, Paris. Seuls les contenus dont le titre en contient un seront gardés.">
        <input className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Field>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">Les nouvelles vidéos apparaîtront dans Explorer. Tu choisis celles à préparer ; aucun audio n’est généré automatiquement.</p>
      {create.isError && <Notice tone="warning">{errorText(create.error)}</Notice>}
    </>}
  </Sheet>;
}
