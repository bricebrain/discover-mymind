import { api, ApiError } from '../api/client';
import type { WeeklyReport } from './types';

export const fetchWeekly = (week: string) => api<WeeklyReport>(`/api/weekly?week=${encodeURIComponent(week)}`);

export async function fetchWeeklyMarkdown(week: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`/api/weekly/export?week=${encodeURIComponent(week)}`, {
      credentials: 'same-origin', headers: { Accept: 'text/markdown' },
    });
  } catch {
    throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ton réseau.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error?.code ?? 'http_error', data?.error?.message ?? 'Export impossible pour l’instant.');
  }
  return response.blob();
}

export function downloadMarkdown(blob: Blob, week: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `discover-weekly-${week}.md`;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Laisser le navigateur prendre en charge le téléchargement avant de libérer le Blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function weeklyError(error: Error): string {
  if (error instanceof ApiError && error.code === 'weekly_limit_exceeded') {
    return 'Cette semaine ou la précédente dépasse la limite du bilan. Aucun résultat partiel n’est affiché. Tu peux essayer l’export, qui ne porte que sur la semaine choisie.';
  }
  if (error instanceof ApiError && error.code === 'network') return 'Le bilan nécessite une connexion. Réessaie lorsque le réseau est disponible.';
  return error.message;
}
