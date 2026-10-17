import type { PrepareOptions, QueueItem } from './types';

export const COVERAGES = {full:'Intégral',condensed:'Condensé',essentials:'L’essentiel'};
export const STAGES: Record<string,string> = {
  download:'Téléchargement',normalize:'Préparation audio',transcribe:'Transcription',source_ready:'Source prête dans l’Atelier',
  plan:'Plan de l’épisode',extract:'Analyse des sources',evaluate:'Contrôle de fidélité',review:'À relire dans l’Atelier',
  translate:'Traduction fidèle',adapt:'Adaptation',tts:'Création de l’audio',publish:'Publication',
};
export function defaultOptions(durationSec: number | null,showId: string): PrepareOptions {
  const coverage = showId.startsWith('bloomberg-daybreak') ? 'essentials' : (durationSec ?? 0)>1500 ? 'condensed' : 'full';
  return {coverage,level:'B1',style:'narration',targetMinutes:coverage==='full' ? null : coverage==='condensed' ? 12 : 4,faithful:false,keepOriginalCopy:false};
}
export function queueLabel(item: QueueItem) {
  if (item.status==='pending') return item.stage==='review' ? 'À relire dans l’Atelier sur le Mac' : item.stage==='source_ready' ? 'Source prête · en attente de l’adaptation' : 'En file · ouvrir l’Atelier sur le Mac';
  if (item.status==='leased') return `En préparation · ${STAGES[item.stage ?? ''] ?? 'Atelier'}`;
  return {done:'Prêt',failed:'Échec',cancelled:'Annulé'}[item.status];
}
export function optionsLabel(o: PrepareOptions) {
  return `${COVERAGES[o.coverage]} · ${o.level==='original' ? 'Anglais non simplifié' : o.level}${o.targetMinutes ? ` · ${o.targetMinutes} min` : ''}`;
}
