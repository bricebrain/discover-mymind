export interface WeeklyMetrics {
  listenedMinutes: number;
  completedContents: number;
  notesCreated: number;
  notesModified: number;
  articlesRead: number;
  articlesSaved: number;
  linkedPassages: number;
  publishedPreparations: number;
}

/** Extension attendue du Worker : absente du contrat W actuel. */
export interface WeeklyActivities {
  listening: { targetType: 'episode' | 'variant'; targetId: string; title: string; listenedMs: number; completed: number }[];
  notes: { id: string; title: string }[];
  articles: { id: string; title: string; wasRead: number; wasSaved: number }[];
  publications: { id: string; contentId: string; title: string }[];
}

export interface WeeklyReport {
  week: string;
  timeZone: 'Europe/Paris';
  start: string;
  end: string;
  previousWeek: string;
  metrics: WeeklyMetrics;
  previous: { week: string; metrics: WeeklyMetrics };
  delta: WeeklyMetrics;
  activities?: WeeklyActivities;
}
