// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RelatedList } from './RelatedList';
import { EventGroupCard } from './EventGroupCard';
import { getEventGroups, type EventGroup } from './api';
const group: EventGroup = { groupId: 'event', title: 'Même sujet', dossierCandidate: true, updatedAt: '2026-10-19', members: [
  { type: 'article', id: 'a', title: 'Un article', publisher: 'Journal', href: '/?a=a', sourceKind: 'article' },
  { type: 'episode', id: 'e', title: 'Un épisode', publisher: 'Radio', href: '/?e=e', sourceKind: 'podcast' },
] };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); vi.unstubAllGlobals(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter><RelatedList type="article" id="a/1" /></MemoryRouter></QueryClientProvider>);
}
describe('rapprochements', () => {
  it('affiche les voisins et membres avec leurs liens internes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ neighbors: [group.members[0]], groups: [group] })));
    mount();
    await screen.findByText('Même événement · 2 sources');
    expect(screen.getByRole('link', { name: /Un épisode/ }).getAttribute('href')).toBe('/?e=e');
    expect(fetch).toHaveBeenCalledWith('/api/related?type=article&id=a%2F1', expect.anything());
  });
  it('masque la liste vide', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ neighbors: [], groups: [] })));
    mount();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('expose les erreurs et permet de recharger', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    mount(); await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined();
  });
  it('conserve articles et épisodes pour la création et permet de masquer', () => {
    const create = vi.fn(), dismiss = vi.fn();
    render(<MemoryRouter><EventGroupCard group={group} onCreateDossier={create} onDismiss={dismiss} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Préparer un condensé' }));
    expect(create).toHaveBeenCalledWith([{ type: 'article', id: 'a' }, { type: 'episode', id: 'e' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' })); expect(dismiss).toHaveBeenCalledOnce();
  });
  it('ne tronque pas silencieusement un groupe trop grand', () => {
    render(<MemoryRouter><EventGroupCard group={{ ...group, members: Array.from({ length: 7 }, (_, i) => ({ ...group.members[0]!, id: `${i}` })) }} onCreateDossier={() => {}} /></MemoryRouter>);
    expect((screen.getByRole('button', { name: 'Préparer un condensé' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('encode la date des groupes récents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ groups: [] })));
    await getEventGroups('2026-10-19T00:00:00Z');
    expect(fetch).toHaveBeenCalledWith('/api/related/groups?since=2026-10-19T00%3A00%3A00Z', expect.anything());
  });
});
