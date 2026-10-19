import { noteMarkdown } from '../export/markdown';
import type { WeekData, WeekRange } from './data';
import { metrics } from './data';

const label = (value: string) => value.replace(/[\r\n]/g, ' ').replace(/([\[\]\\])/g, '\\$1');
function source(title: string, url: string | null): string {
  if (!url || !/^https?:\/\//i.test(url)) return label(title);
  return `[${label(title)}](<${url.replace(/[<>\r\n]/g, c => encodeURIComponent(c))}>)`;
}

export function weeklyMarkdown(data: WeekData, range: WeekRange): string {
  const m = metrics(data, range);
  const lines = [
    `# Discover — bilan ${range.week}`, '',
    `Fuseau : ${range.timeZone} · du ${range.start} au ${range.end} (borne exclue).`, '',
    `- Minutes écoutées (estimation par progression) : ${m.listenedMinutes}`,
    `- Contenus terminés : ${m.completedContents}`,
    `- Notes créées : ${m.notesCreated} ; modifiées : ${m.notesModified}`,
    `- Articles lus : ${m.articlesRead} ; enregistrés : ${m.articlesSaved}`,
    `- Passages ou citations liés : ${m.linkedPassages}`,
    `- Préparations publiées : ${m.publishedPreparations}`, '',
    '## Notes de la semaine', '',
    data.notes.length ? data.notes.map(noteMarkdown).join('\n\n---\n\n') : '_Aucune note._', '',
    '## Contenus écoutés', '',
    ...data.listening.map(p => `- ${source(p.title, p.sourceUrl)} — ${p.targetType}:${p.targetId} · ${Math.round(p.listenedMs / 600) / 100} min${p.completed ? ' · terminé' : ''}`),
    ...(data.listening.length ? [] : ['_Aucun contenu écouté._']), '',
    '## Articles de la semaine', '',
    ...data.articles.map(a => `- ${source(a.title, a.url)}${a.wasRead ? ' · lu' : ''}${a.wasSaved ? ' · enregistré' : ''}`),
    ...(data.articles.length ? [] : ['_Aucun article._']), '',
    '## Passages et citations de la semaine', '',
    ...data.links.filter(l => l.segmentId || l.quote).map(l => `- ${source(l.targetTitle, l.sourceUrl)}${l.segmentId ? ` · ${l.variantKey}/${l.segmentId}` : ''}${l.quote ? ` — « ${l.quote} »` : ''}`),
    ...(m.linkedPassages ? [] : ['_Aucun passage ni citation._']), '',
    '## Préparations publiées', '',
    ...data.publications.map(p => `- ${source(p.title, p.sourceUrl)} — ${p.contentId} · ${p.publishedAt}`),
    ...(data.publications.length ? [] : ['_Aucune préparation._']), '',
    '## Mots appris', '', '_Non suivi (hors périmètre I8)._', '',
  ];
  return lines.join('\n');
}
