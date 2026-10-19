import { expect, it } from 'vitest';
import { eventGroupsByDay } from './eventFeed';
import { dayLabel } from '../explorer/dayLabel';
import type { EventGroup } from './api';
const members: EventGroup['members'] = ['a', 'b'].map((id) => ({ id, type: 'article', title: id, href: '/', publisher: id, sourceKind: 'article' }));
const group: EventGroup = { groupId: 'first', title: 'Test', dossierCandidate: true, updatedAt: '2026-10-19T10:00:00Z', members };
it('retient le plus récent par jour et exclut masquage, non-candidats et groupes trop grands', () => {
  const list = [group, { ...group, groupId: 'new', updatedAt: '2026-10-19T11:00:00Z' }];
  expect(eventGroupsByDay(list, []).get(dayLabel(group.updatedAt))?.groupId).toBe('new'); expect(list[0]).toBe(group);
  expect(eventGroupsByDay([group], ['first']).size).toBe(0);
  expect(eventGroupsByDay([{ ...group, dossierCandidate: false }], []).size).toBe(0);
  expect(eventGroupsByDay([{ ...group, members: [...members, ...members, ...members, ...members] }], []).size).toBe(0);
});
