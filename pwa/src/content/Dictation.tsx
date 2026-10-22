import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Snail } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import type { ContentSegment } from '../api/contents';
import { CATEGORY_LABELS, DICTATION_PROGRESS_KEY, submitDictation, type DictationResult, type DictationToken } from '../api/dictation';

const percent = (n: number) => `${Math.round(n * 100)} %`;

/** Ce que tu as tapé, mot à mot : reconnu, manqué, mal entendu ou en trop. */
function Comparison({ tokens }: { tokens: DictationToken[] }) {
  return <p lang="en" className="m-0 font-reading text-[1.05rem] leading-[2]">
    {tokens.map((t, i) => <span key={i} className="mr-1.5 inline-block">
      {t.status === 'ok' && <span>{t.expected}</span>}
      {t.status === 'missing' && <span className="rounded bg-rose-100 px-1 text-rose-900" title="Manqué">{t.expected}</span>}
      {t.status === 'wrong' && <><s className="text-muted-foreground">{t.typed}</s> <span className="rounded bg-amber-100 px-1 font-semibold text-amber-950">{t.expected}</span></>}
      {t.status === 'extra' && <s className="text-muted-foreground" title="En trop">{t.typed}</s>}
    </span>)}
  </p>;
}

/**
 * Dictée du passage : écouter une phrase (texte masqué), taper ce qu'on entend, puis voir mot à mot ce qui a échappé
 * à l'oreille et pourquoi. Chaque essai nourrit la mesure de progression.
 */
export function Dictation({ contentId, publicationId, variantKey, segments, onPlayRange, onSlow, slow }: {
  contentId: string; publicationId: string; variantKey: string; segments: ContentSegment[];
  onPlayRange: (startMs: number, endMs: number) => void; onSlow: (slow: boolean) => void; slow: boolean;
}) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [results, setResults] = useState<DictationResult[]>([]);
  const check = useMutation({
    mutationFn: () => submitDictation(contentId, variantKey, { publicationId, segmentId: segments[index]!.id, typed }),
    onSuccess: (r) => { setResults((all) => [...all, r]); void queryClient.invalidateQueries({ queryKey: DICTATION_PROGRESS_KEY }); },
  });
  const segment = segments[index];
  const result = check.data?.segmentId === segment?.id ? check.data : undefined;
  const done = results.length;
  const play = () => segment && segment.startMs != null && segment.endMs != null && onPlayRange(segment.startMs, segment.endMs);
  const next = () => { setIndex((i) => i + 1); setTyped(''); check.reset(); };

  if (!segment) return <Notice tone="success">
    Dictée terminée : {done} phrase{done > 1 ? 's' : ''}, {percent(results.reduce((a, r) => a + r.correctWords, 0) / Math.max(1, results.reduce((a, r) => a + r.expectedWords, 0)))} des mots reconnus.
    Passe à la réécoute sans texte.
  </Notice>;

  return <div className="space-y-3">
    <p className="m-0 text-sm text-muted-foreground">
      Phrase {index + 1} / {segments.length}{done ? ` · ${percent(results.reduce((a, r) => a + r.correctWords, 0) / Math.max(1, results.reduce((a, r) => a + r.expectedWords, 0)))} des mots reconnus jusqu’ici` : ''}
    </p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={play}><Play className="size-4" />Écouter la phrase</Button>
      <Button variant={slow ? 'default' : 'outline'} aria-pressed={slow} onClick={() => onSlow(!slow)}><Snail className="size-4" />Plus lentement</Button>
    </div>
    <label className="block text-sm font-medium" htmlFor={`dictee-${segment.id}`}>Ce que tu entends</label>
    <textarea id={`dictee-${segment.id}`} lang="en" rows={2} value={typed} disabled={!!result} onChange={(e) => setTyped(e.target.value)}
      autoCapitalize="none" autoCorrect="off" spellCheck={false}
      className="w-full rounded-xl border border-border bg-card p-3 font-reading text-[1.05rem] outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15" />
    {!result && <div className="flex gap-2">
      <Button disabled={check.isPending} onClick={() => check.mutate()}>{check.isPending ? 'Analyse…' : typed.trim() ? 'Vérifier' : 'Je n’ai rien compris'}</Button>
      <Button variant="ghost" onClick={next}>Passer</Button>
    </div>}
    {check.isError && <Notice tone="error">{check.error.message}</Notice>}
    {result && <div className="space-y-3" role="status">
      <p className="m-0 text-sm font-semibold">{percent(result.accuracy)} des mots reconnus · {result.correctWords}/{result.expectedWords}</p>
      <Comparison tokens={result.tokens} />
      {result.errors.length > 0 && <ul className="m-0 grid list-none gap-2 p-0">
        {result.errors.map((e, i) => <li key={i} className={cn('rounded-xl border border-border/60 p-3 text-sm')}>
          <p className="m-0"><span className="font-semibold">{CATEGORY_LABELS[e.category]}</span> · <span lang="en">« {e.expected} »</span>
            {e.heard ? <> entendu <span lang="en">« {e.heard} »</span></> : ' non entendu'}</p>
          {e.explanation && <p className="m-0 mt-1 text-muted-foreground">{e.explanation}</p>}
        </li>)}
      </ul>}
      {result.tip && <Notice>{result.tip}</Notice>}
      <div className="flex gap-2"><Button variant="outline" onClick={play}>Réécouter</Button><Button onClick={next}>Phrase suivante</Button></div>
    </div>}
  </div>;
}
