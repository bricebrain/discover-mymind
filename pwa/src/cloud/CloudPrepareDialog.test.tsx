// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloudPrepareDialog } from './CloudPrepareDialog';
import { cloudApi, type CloudStatus } from './api';

let client:QueryClient;
const status:CloudStatus={owner:true,enabled:true,youtube:true,month:'2026-10',reservedMicros:2_000_000,limitMicros:10_000_000,runMicros:1_000_000};
const quote={id:'quote',title:'Une vidéo publique',reserveMicros:1_000_000,expiresAt:'2099-01-01',attribution:'Author',durationSec:600};
const target={kind:'youtube' as const,id:'AbCdEf01234'};
function mount() {
  const onQueued=vi.fn();
  render(<QueryClientProvider client={client}><CloudPrepareDialog target={target} title="Ma vidéo" onClose={()=>{}} onQueued={onQueued} /></QueryClientProvider>);
  return onQueued;
}
beforeEach(()=>{
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  vi.spyOn(cloudApi,'status').mockResolvedValue(status);
  vi.spyOn(cloudApi,'quote').mockResolvedValue(quote);
  vi.spyOn(cloudApi,'start').mockResolvedValue({id:'run'});
  vi.spyOn(cloudApi,'unlock').mockResolvedValue({});
  vi.spyOn(cloudApi,'lock').mockResolvedValue();
});
afterEach(()=>{cleanup();client.clear();vi.restoreAllMocks();});
it('n’autorise aucune génération lorsque le serveur est désactivé',async()=>{
  vi.mocked(cloudApi.status).mockResolvedValue({...status,enabled:false});mount();
  await screen.findByText(/attend son activation/);
  expect(screen.queryByRole('button',{name:'Vérifier la source'})).toBeNull();
  expect(cloudApi.start).not.toHaveBeenCalled();
});
it('déverrouille avec la phrase sans l’enregistrer et affiche une erreur lisible',async()=>{
  vi.mocked(cloudApi.status).mockResolvedValueOnce({owner:false,enabled:true});
  vi.mocked(cloudApi.unlock).mockRejectedValueOnce(new Error('Phrase incorrecte'));mount();
  const input=await screen.findByLabelText('Phrase secrète Discover');
  fireEvent.change(input,{target:{value:'une phrase'}});fireEvent.click(screen.getByRole('button',{name:'Déverrouiller l’Atelier'}));
  await screen.findByText('Phrase incorrecte');
  expect(cloudApi.unlock).toHaveBeenCalledWith('une phrase',expect.anything());
  expect(localStorage.getItem('passphrase')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Déverrouiller l’Atelier'}));
  await screen.findByRole('button',{name:'Vérifier la source'});
  expect(screen.queryByLabelText('Phrase secrète Discover')).toBeNull();
});
it('vérifie sans dépense puis exige un accord explicite avant de lancer',async()=>{
  const queued=mount();fireEvent.click(await screen.findByRole('button',{name:'Vérifier la source'}));
  const launch=await screen.findByRole('button',{name:'Lancer sans Mac'});
  expect((launch as HTMLButtonElement).disabled).toBe(true);
  expect(cloudApi.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox',{name:/J’autorise/}));fireEvent.click(launch);
  await waitFor(()=>expect(queued).toHaveBeenCalledTimes(1));
  expect(cloudApi.quote).toHaveBeenCalledWith(target,{level:'B1',coverage:'essentials',style:'narration',targetMinutes:4,faithful:false,keepOriginalCopy:false});
  expect(cloudApi.start).toHaveBeenCalledTimes(1);
});
it('changer de niveau invalide le devis et l’accord précédent',async()=>{
  mount();fireEvent.click(await screen.findByRole('button',{name:'Vérifier la source'}));
  await screen.findByRole('button',{name:'Lancer sans Mac'});fireEvent.click(screen.getByRole('checkbox',{name:/J’autorise/}));
  fireEvent.change(screen.getByLabelText('Niveau d’anglais'),{target:{value:'A2'}});
  expect(screen.queryByRole('button',{name:'Lancer sans Mac'})).toBeNull();
  expect(screen.getByRole('button',{name:'Vérifier la source'})).toBeDefined();
});
it('permet de verrouiller la session propriétaire',async()=>{
  mount();await screen.findByRole('button',{name:'Verrouiller l’Atelier'});
  vi.mocked(cloudApi.status).mockResolvedValue({owner:false,enabled:true});
  fireEvent.click(screen.getByRole('button',{name:'Verrouiller l’Atelier'}));
  await screen.findByLabelText('Phrase secrète Discover');
  expect(cloudApi.lock).toHaveBeenCalledTimes(1);
});
