// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectionProvider, useSelection } from './useSelection';
import { CreateDossierFromSelection } from './CreateDossierFromSelection';
vi.mock('../dossiers/DossierPrepareDialog', () => ({ DossierPrepareDialog: ({ dossier }: { dossier: { title: string } }) => <div>Options : {dossier.title}</div> }));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
function Controls() {
  const s = useSelection();
  return <><button onClick={() => s.start({ type: 'article', id: 'a', title: 'Article' })}>Premier</button>
    <button onClick={() => s.toggle({ type: 'episode', id: 'e', title: 'Podcast' })}>Deuxième</button></>;
}
it('crée un dossier sans préparation automatique, vide la sélection et ouvre ses options', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ dossier: { id: 'd', title: 'Mon dossier', sources: [] } }, { status: 201 })));
  render(<QueryClientProvider client={client}><SelectionProvider><Controls /><CreateDossierFromSelection /></SelectionProvider></QueryClientProvider>);
  fireEvent.click(screen.getByText('Premier')); fireEvent.click(screen.getByText('Deuxième'));
  fireEvent.click(screen.getByRole('button', { name: 'Créer un dossier' }));
  await screen.findByText('Options : Mon dossier');
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('/api/dossiers', expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Nouveau dossier', sources: [{ type: 'article', id: 'a' }, { type: 'episode', id: 'e' }] }) }));
});
