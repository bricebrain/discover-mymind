/** Contexte du passage anglais vérifié par le parent ; remonter le volet avec une key par passage. */
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Field, Notice, Sheet, inputCls } from '../components/ui/kit';
import { useOnline } from '../offline/OfflineBanner';
import type { WordPickInput } from './api';
import { validWordPick } from './validation';
import { useWordPickMutations } from './useWordPicks';
export function WordPickSheet({ onClose, ...input }: Omit<WordPickInput, 'language'> & { onClose: () => void }) {
  const [word, setWord] = useState(input.word);
  const { save } = useWordPickMutations();
  const online = useOnline();
  const valid = validWordPick(word, input.sentence);
  return <Sheet title="Garder une expression" onClose={onClose} locked={save.isPending} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={save.isPending}>{save.isSuccess ? 'Fermer' : 'Annuler'}</Button>
    {!save.isSuccess && <Button disabled={!online || !valid || save.isPending} onClick={() => save.mutate({ ...input, word: word.trim(), language: 'en' })}>
      {save.isPending ? 'Enregistrement…' : 'Garder ce mot'}</Button>}
  </>}>
    <Field label="Mot ou expression" hint="Jusqu’à 8 mots présents dans le passage.">
      <input className={inputCls} value={word} maxLength={120} disabled={save.isPending || save.isSuccess} onChange={(e) => setWord(e.target.value)} />
    </Field>
    <blockquote className="border-l-2 border-primary/30 pl-3 text-sm leading-relaxed">{input.sentence}</blockquote>
    {!online && <Notice>Reconnecte-toi pour garder ce mot.</Notice>}
    {save.isError && <Notice tone="error">{save.error.message}</Notice>}
    {save.isSuccess && <Notice tone="success">{save.data.alreadySaved ? 'Déjà gardé : ta sélection est conservée.' : 'Mot gardé. Il sera envoyé à EnglishFluency par l’Atelier.'}</Notice>}
  </Sheet>;
}
