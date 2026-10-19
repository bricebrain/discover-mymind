import { ChevronRight, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Notice, Select, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, formatDuration, formatWhen, type Category } from '../api/episodes';
import { useCreateShow, usePreviewShow, useResolveShow, type Candidate, type ShowPreview } from '../api/shows';

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [Category, string][];
const LANGUAGE_OPTIONS = [['fr', 'Français'], ['en', 'Anglais']] as const;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Une erreur est survenue.';

/** Ajout : recherche (nom, lien Apple, RSS) → choix → aperçu → réglages → suivre. */
export function AddShowDialog({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ShowPreview | null>(null);
  const [category, setCategory] = useState<Category>('news');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [filter, setFilter] = useState('');
  const resolve = useResolveShow();
  const previewShow = usePreviewShow();
  const create = useCreateShow();

  const showPreview = (p: ShowPreview) => {
    setPreview(p);
    setLanguage(p.language ?? 'fr');
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    setPreview(null);
    resolve.mutate(input, { onSuccess: (r) => r.kind === 'preview' && showPreview(r.preview) });
  };
  const choose = (c: Candidate) => previewShow.mutate(c, { onSuccess: (r) => showPreview(r.preview) });
  const follow = () => {
    if (!preview) return;
    const keywords = filter.split(',').map((k) => k.trim()).filter(Boolean);
    create.mutate(
      { feedUrl: preview.feedUrl, title: preview.title, publisher: preview.publisher, appleId: preview.appleId, imageUrl: preview.imageUrl,
        sourceType: preview.sourceType, channelId: preview.channelId,
        language, category, titleFilter: keywords.length ? keywords : null },
      { onSuccess: onClose },
    );
  };
  const candidates = resolve.data?.kind === 'candidates' ? resolve.data.candidates : [];
  const busy = resolve.isPending || previewShow.isPending;

  return <Sheet wide title={preview ? 'Suivre cette source' : 'Ajouter une source'} onClose={onClose} locked={create.isPending} footer={<>
    {preview && <Button variant="ghost" onClick={() => setPreview(null)}>Retour</Button>}
    <Button variant="ghost" onClick={onClose}>Annuler</Button>
    {preview && <Button onClick={follow} disabled={create.isPending}>{create.isPending ? 'Ajout…' : 'Suivre'}</Button>}
  </>}>
    {!preview && <>
      <form onSubmit={search} className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Podcast, lien de chaîne YouTube ou @identifiant</span>
        <div className="flex gap-2">
          <span className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus type="text" inputMode="search" enterKeyHint="search" aria-label="Podcast, lien de chaîne YouTube ou @identifiant"
              className={cn(inputCls, 'pl-9')} value={input} onChange={(e) => setInput(e.target.value)} />
          </span>
          <Button type="submit" disabled={input.trim().length < 2 || busy}>Chercher</Button>
        </div>
        <span className="text-xs text-muted-foreground">Podcast : nom, Apple Podcasts ou RSS. YouTube : lien de chaîne ou @identifiant.</span>
      </form>
      {busy && <div className="grid place-items-center p-4"><Spinner /></div>}
      {(resolve.isError || previewShow.isError) && <Notice tone="warning">{errorText(resolve.error ?? previewShow.error)}</Notice>}
      {resolve.data?.kind === 'candidates' && candidates.length === 0 && <p className="m-0 text-sm leading-relaxed text-muted-foreground">
        Aucune émission trouvée avec un flux RSS public. Certaines radios (Radio France, par exemple) n’en publient pas dans l’annuaire Apple.
      </p>}
      {candidates.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {candidates.map((c) => <li key={c.appleId}>
          <button type="button" disabled={busy} onClick={() => choose(c)}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted disabled:opacity-50">
            {c.imageUrl ? <img src={c.imageUrl} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" /> : <span className="size-12 shrink-0 rounded-xl bg-muted" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{c.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{c.publisher}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>)}
      </ul>}
    </>}

    {preview && <>
      <div className="flex items-center gap-4">
        {preview.imageUrl ? <img src={preview.imageUrl} alt="" className="size-[72px] shrink-0 rounded-2xl bg-muted object-cover" /> : <span className="size-[72px] shrink-0 rounded-2xl bg-muted" />}
        <div className="min-w-0">
          <p className="m-0 text-[17px] font-semibold leading-snug">{preview.title}</p>
          <p className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {[preview.publisher, preview.medianMinutes ? `≈ ${preview.medianMinutes} min` : null,
              preview.episodesPerWeek ? `${preview.episodesPerWeek} ${preview.sourceType === 'youtube' ? 'vidéo(s)' : 'épisode(s)'} / semaine` : null,
              preview.hasTranscripts ? 'transcriptions fournies' : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="rounded-2xl bg-muted p-3">
        <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{preview.sourceType === 'youtube' ? 'Dernières vidéos' : 'Derniers épisodes'}</p>
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
      {preview.sourceType === 'youtube' && <p className="m-0 text-sm leading-relaxed text-muted-foreground">Les nouvelles vidéos apparaîtront dans Explorer. Tu choisis celles à préparer ; aucun audio n’est généré automatiquement.</p>}
      {create.isError && <Notice tone="warning">{errorText(create.error)}</Notice>}
    </>}
  </Sheet>;
}
