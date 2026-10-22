import type { PrepareOptions, QueueItem } from './types';

const COVERAGE_LABELS = {guided:'Original guidé',full:'Intégral',condensed:'Condensé',essentials:'L’essentiel'};
export const COVERAGES = {guided:COVERAGE_LABELS.guided,essentials:'L’essentiel · 4 min (Découvrir)'};
export const EXPLANATION_LEVEL_OPTIONS = [['A2', 'A2'], ['B1', 'B1'], ['B2', 'B2'], ['C1', 'C1']] as const;
export const LEVEL_OPTIONS = [['A2', 'A2'], ['B1', 'B1'], ['B2', 'B2'], ['C1', 'C1'], ['original', 'Anglais non simplifié']] as const;
export const STAGES: Record<string,string> = {
  download:'Téléchargement',normalize:'Préparation audio',transcribe:'Transcription',source_ready:'Source prête dans l’Atelier',
  plan:'Plan de l’épisode',extract:'Analyse des sources',evaluate:'Contrôle de fidélité',review:'À relire dans l’Atelier',
  translate:'Traduction fidèle',adapt:'Adaptation',tts:'Création de l’audio',publish:'Publication',
};
/** Original guidé par défaut : l'anglais n'est jamais réécrit, le niveau règle les explications du guide. */
export function defaultOptions(): PrepareOptions {
  return {coverage:'guided',level:'B1',style:'narration',targetMinutes:null,faithful:false,keepOriginalCopy:false};
}
export function queueLabel(item: QueueItem) {
  if (item.executor==='cloud' && item.status==='pending') return 'En file · sans Mac';
  if (item.executor==='cloud' && item.status==='leased') return `Sans Mac · ${STAGES[item.stage ?? ''] ?? 'Demande enregistrée'}`;
  if (item.status==='pending') return item.stage==='review' ? 'À relire dans l’Atelier sur le Mac' : item.stage==='source_ready' ? 'Source prête · en attente de l’adaptation' : 'En attente sur le Mac';
  if (item.status==='leased') return `En préparation · ${STAGES[item.stage ?? ''] ?? 'Atelier'}`;
  return {done:'Prêt',failed:'Échec',cancelled:'Annulé'}[item.status];
}
export function optionsLabel(o: PrepareOptions) {
  if (o.coverage==='guided') return `Original guidé · explications ${o.level}`;
  return `${COVERAGE_LABELS[o.coverage]} · ${o.level==='original' ? 'Anglais non simplifié' : o.level}${o.targetMinutes ? ` · ${o.targetMinutes} min` : ''}`;
}
