import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, cardCls } from '@/components/ui/kit';
import { useState } from 'react';
import { PreparedEpisode } from '../components/PreparedEpisode';
import { optionsLabel, queueLabel } from '../queue/options';
import { PrepareDialog } from '../queue/PrepareDialog';
import { usePreparation } from '../queue/usePreparation';
import { AtelierHint, PreparationProgress } from '../queue/PreparationProgress';

const MIN_CHARS = 20;

/**
 * « Préparer en anglais » sur une note : l'Atelier traduit / adapte le texte à ton niveau, en lit une
 * version audio, puis la publie. Les versions s'écoutent ici, sous la note, sans changer de page.
 */
export function NotePreparation({ id, title, body, synced, englishContentId }: {
  id: string; title: string; body: string; synced: boolean; englishContentId: string | null;
}) {
  const { query, cancel, retry } = usePreparation({ kind: 'reflection', id });
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);
  const items = query.data?.items ?? [];
  const current = items.find((i) => i.status === 'pending' || i.status === 'leased');
  const failed = !current && items[0]?.status === 'failed' ? items[0] : undefined;
  const found = items.find((i) => i.status === 'done' && i.contentId)?.contentId ?? englishContentId;
  const contentId = found === deleted ? null : found;
  const tooShort = body.trim().length < MIN_CHARS;

  return <section className="mt-8 border-t border-border pt-4">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <p className="m-0 flex-1 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">En anglais</p>
      <Button size="sm" variant="outline" disabled={!!current || tooShort || !synced || query.isPending} onClick={() => setOpen(true)}>
        <Sparkles className="size-4 text-primary" />{contentId ? 'Préparer une autre version' : 'Préparer en anglais'}
      </Button>
    </div>
    {(tooShort || !synced) && !contentId && <p className="m-0 text-xs text-muted-foreground">
      {tooShort ? `Écris au moins ${MIN_CHARS} caractères pour pouvoir préparer la note.` : 'La note doit être synchronisée avant d’être préparée.'}
    </p>}
    {query.isError && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Réessayer</Button>}>{query.error.message}</Notice>}
    {(current ?? failed) && <div className={`${cardCls} mb-4 p-3`} role="status">
      <p className="m-0 text-sm font-semibold">{queueLabel((current ?? failed)!)}</p>
      <p className="m-0 text-xs text-muted-foreground">{optionsLabel((current ?? failed)!.options)}</p>
      {current?.status === 'leased' && <PreparationProgress item={current} fetchedAt={query.dataUpdatedAt} />}
      {current?.status === 'pending' && current.executor !== 'cloud' && <AtelierHint seenAt={query.data?.atelierSeenAt ?? null} waiting={current.waiting} />}
      {failed?.error && <p className="m-0 mt-1 text-sm text-red-700">{failed.error}</p>}
      <div className="-mx-2 mt-1 flex gap-1">
        {current && <Button size="sm" variant="ghost" className="text-primary" disabled={cancel.isPending} onClick={() => cancel.mutate(current.id)}>Annuler</Button>}
        {failed && failed.executor!=='cloud' && <Button size="sm" variant="ghost" className="text-primary" disabled={retry.isPending} onClick={() => retry.mutate(failed.id)}>Réessayer</Button>}
      </div>
    </div>}
    {contentId && <PreparedEpisode contentId={contentId} about={null} onDeleted={() => setDeleted(contentId)} />}
    {open && <PrepareDialog target={{ kind: 'reflection', id }} title={title || 'Note sans titre'} faithfulAllowed
      initial={{ coverage: 'full', level: 'B1', style: 'narration', targetMinutes: null, faithful: false, keepOriginalCopy: false }}
      onClose={() => setOpen(false)} />}
  </section>;
}
