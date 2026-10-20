import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Notice, Select, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import type { PrepTarget } from '../api/queue';
import { LEVEL_OPTIONS } from '../queue/options';
import { dollars } from './api';
import { useCloudPreparation } from './useCloudPreparation';

/** Préparation manuelle, phrase secrète jamais enregistrée sur l'appareil. */
export function CloudPrepareDialog({target,title,onClose,onQueued}:{target:PrepTarget;title:string;onClose:()=>void;onQueued:()=>void}) {
  const cloud=useCloudPreparation(target,onQueued), [passphrase,setPassphrase]=useState(''),[accepted,setAccepted]=useState(false);
  const {status,unlock,lock,estimate,start,quote}=cloud;
  const busy=estimate.isPending || start.isPending || unlock.isPending || lock.isPending;
  const budget=status.data, expired=quote ? Date.parse(quote.expiresAt)<=Date.now() : false;
  const error=status.error ?? unlock.error ?? lock.error ?? estimate.error ?? start.error;
  return <Sheet title="Préparer sans Mac" onClose={onClose} locked={busy} footer={<>
    <Button variant="ghost" onClick={onClose} disabled={busy}>Retour</Button>
    {budget?.enabled && budget.owner && (!quote || expired
      ? <Button disabled={busy || !navigator.onLine} onClick={()=>{setAccepted(false);estimate.mutate();}}>{estimate.isPending ? 'Vérification…' : 'Vérifier la source'}</Button>
      : <Button disabled={busy || !accepted || !navigator.onLine} onClick={()=>start.mutate()}>{start.isPending ? 'Enregistrement…' : 'Lancer sans Mac'}</Button>)}
  </>}>
    <p className="m-0 text-[15px] font-semibold">{title}</p>
    <p className="m-0 text-sm text-muted-foreground">L’essentiel en anglais, narration d’environ 4 minutes, traduction française et audio. Une source courte donne une version plus courte. Tu pourras fermer l’app une fois la demande enregistrée.</p>
    {target.kind==='youtube' && <Notice>Vidéo publique terminée, 15 minutes maximum. Gemini tente une transcription même sans sous-titres. Son exactitude reste à vérifier.</Notice>}
    {target.kind==='reflection' && <Notice>Seul le texte déjà enregistré est utilisé (100 à 20 000 caractères). Pour un article, vérifie qu’il contient bien le texte souhaité.</Notice>}
    {status.isPending && <Spinner label="Vérification de l’Atelier cloud" />}
    {budget && !budget.enabled && <Notice tone="warning">L’Atelier sans Mac attend son activation sur le serveur.</Notice>}
    {budget?.enabled && !budget.owner && <form className="flex flex-col gap-3" onSubmit={event=>{
      event.preventDefault();unlock.mutate(passphrase,{onSuccess:()=>setPassphrase('')});
    }}>
      <Field label="Phrase secrète Discover"><input type="password" className={inputCls} autoComplete="current-password" value={passphrase} onChange={event=>setPassphrase(event.target.value)} /></Field>
      <Button type="submit" disabled={busy || !passphrase || !navigator.onLine}>Déverrouiller l’Atelier</Button>
    </form>}
    {budget?.enabled && budget.owner && <>
      <Field label="Niveau d’anglais"><Select value={cloud.level} options={LEVEL_OPTIONS} disabled={busy} onChange={value=>{setAccepted(false);cloud.setLevel(value);}} /></Field>
      <p className="m-0 text-sm text-muted-foreground">Budget cloud · {budget.month} UTC : {dollars(budget.reservedMicros ?? 0)} engagés sur {dollars(budget.limitMicros ?? 0)}. Infrastructure facturée séparément.</p>
      <Button variant="ghost" disabled={busy} onClick={()=>lock.mutate()}>Verrouiller l’Atelier</Button>
      {target.kind==='youtube' && !budget.youtube && <Notice tone="warning">La vérification YouTube doit encore être configurée sur le serveur.</Notice>}
      {quote && !expired && <>
        <p className="m-0 text-sm"><strong>{quote.title}</strong>{quote.attribution && ` · ${quote.attribution}`}</p>
        <Notice tone="warning">Enveloppe réservée : {dollars(quote.reserveMicros)}. Ce montant conservateur reste engagé même en cas d’échec ; ce n’est pas une facture fournisseur. Aucun nouvel essai payant automatique.</Notice>
        <Checkbox checked={accepted} onChange={setAccepted} label={`J’autorise cette préparation dans l’enveloppe de ${dollars(quote.reserveMicros)}.`} />
      </>}
      <p className="m-0 text-xs text-muted-foreground">Gemini et Deepgram sont appelés directement. Les passages signalés par le contrôle de fidélité seront publiés « non relus ». Ce premier lot prépare les sources qui n’ont pas encore de versions.</p>
    </>}
    {!navigator.onLine && <Notice tone="warning">Connexion nécessaire pour enregistrer la préparation.</Notice>}
    {error && <Notice tone="error">{error.message}</Notice>}
  </Sheet>;
}
