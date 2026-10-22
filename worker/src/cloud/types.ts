import type { PrepareOptions } from '../queue/options';

export interface CloudSource {
  kind: 'reflection' | 'youtube'; ref: string; title: string;
  text: string | null; url: string | null; durationSec: number | null;
  attribution: string | null;
}
export interface Snapshot { source: CloudSource; options: PrepareOptions; version: 'cloud-v1' }
export interface CloudRun {
  id: string; quote_id: string; month: string; snapshot_json: string;
  lease_token: string; reserved_micros: number; state: 'reserved'|'running'|'done'|'failed';
}
export interface SourceText { language: string; paragraphs: string[] }
export interface ScriptLine { text: string; fr: string; sourceSegments: string[] }
export interface Script { lines: ScriptLine[] }
export interface Judge { verdict: 'ok'|'review'|'rejected'; reasons: string[] }
export const RUN_MICROS = 1_000_000;
export const MONTHLY_MICROS = 10_000_000;
export const MODEL = 'gemini-3.1-flash-lite';
export const VOICE = 'aura-2-arcas-en';
export const CLOUD_OPTIONS = { coverage:'essentials', style:'narration', targetMinutes:4, faithful:false, keepOriginalCopy:false } as const;
