import { HttpError } from '../http';
export type Ref = { type: string; id: string };
export type Source = Ref & { neighbors: { targetType: string; targetId: string; score: number }[] };
export type Group = { groupId: string; members: Ref[]; dossierCandidate: boolean; title: string };
export function invalid(): never { throw new HttpError(400,'invalid_related','Lot de rapprochements invalide.'); }
export function ref(v: unknown): v is Ref {
  if (!v || typeof v !== 'object') return false;
  const r = v as Ref;
  return ['article','episode','reflection'].includes(r.type) && typeof r.id === 'string' && /^[a-zA-Z0-9-]{1,96}$/.test(r.id);
}
export function validate(v: unknown): { sources: Source[]; groups: Group[] } {
  const b = v as { sources: Source[]; groups: Group[] };
  if (!b || !Array.isArray(b.sources) || !Array.isArray(b.groups) || b.sources.length > 40 || b.groups.length > 20) invalid();
  let links=0, members=0;
  const keys=new Set<string>();
  for (const s of b.sources) {
    if (!ref(s) || !Array.isArray(s.neighbors) || s.neighbors.length>5 || keys.has(s.type+':'+s.id)) invalid();
    keys.add(s.type+':'+s.id);
    const targets=new Set<string>();
    for (const n of s.neighbors) {
      if (!n || typeof n!=='object' || !ref({type:n.targetType,id:n.targetId}) || !Number.isFinite(n.score) || n.score < -1 || n.score > 1) invalid();
      const key=n.targetType+':'+n.targetId;
      if (key===s.type+':'+s.id || targets.has(key)) invalid();
      targets.add(key); links++;
    }
  }
  const groups=new Set<string>();
  for (const g of b.groups) {
    if (!g || typeof g.groupId!=='string' || !/^[a-z0-9-]{1,96}$/.test(g.groupId) || groups.has(g.groupId) ||
      typeof g.title!=='string' || g.title.length>300 || typeof g.dossierCandidate!=='boolean' ||
      !Array.isArray(g.members) || g.members.length>100 || !g.members.every(ref) ||
      new Set(g.members.map(m=>m.type+':'+m.id)).size!==g.members.length) invalid();
    groups.add(g.groupId); members+=g.members.length;
  }
  if (links>200 || members>200) invalid();
  return {
    sources:b.sources.map(s=>({type:s.type,id:s.id,neighbors:s.neighbors.map(n=>({targetType:n.targetType,targetId:n.targetId,score:n.score}))})),
    groups:b.groups.map(g=>({groupId:g.groupId,title:g.title,dossierCandidate:g.dossierCandidate,members:g.members.map(m=>({type:m.type,id:m.id}))})),
  };
}
