import type { EventGroup } from './api';
import { dayLabel } from '../explorer/dayLabel';
/** Un candidat récent par journée présente dans le fil ; aucun groupe tronqué. */
export function eventGroupsByDay(groups: EventGroup[], hidden: string[]) {
  const result = new Map<string, EventGroup>();
  for (const group of [...groups].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    if (!group.dossierCandidate || hidden.includes(group.groupId) || group.members.length < 2 || group.members.length > 6) continue;
    const day = dayLabel(group.updatedAt);
    if (!result.has(day)) result.set(day, group);
  }
  return result;
}
