export interface PrepareOptions {
  coverage: 'full' | 'condensed' | 'essentials';
  level: 'A2' | 'B1' | 'B2' | 'C1' | 'original';
  style: 'narration' | 'dialogue';
  targetMinutes: number | null;
  faithful: boolean;
  keepOriginalCopy: boolean;
}
/** Avancement calculé par le Worker pour une préparation en cours. */
export interface QueueProgress {
  stages: string[]; current: number; percent: number; remainingSec: number;
  startedAt: string | null; stageStartedAt: string | null; history: boolean;
}
export interface QueueItem {
  progress?: QueueProgress | null;
  executor?: 'mac'|'cloud';
  id: string; kind: 'episode' | 'reflection' | 'youtube' | 'dossier'; ref: string; title: string;
  options: PrepareOptions; status: 'pending' | 'leased' | 'done' | 'failed' | 'cancelled';
  stage: string | null; attempts: number; maxAttempts: number; error: string | null;
  contentId: string | null; leaseExpiresAt: string | null; createdAt: string; updatedAt: string;
}
