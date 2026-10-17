export interface ManifestFile { sha256: string; size: number; contentType: string }
export interface VariantAudio {
  source: 'r2' | 'publisher_stream'; file?: string; url?: string;
  origin: 'original' | 'kokoro'; durationMs: number;
  timingSource: 'rss_srt' | 'rss_vtt' | 'macwhisper_srt' | 'kokoro' | 'none';
}
export interface Variant {
  key: string; kind: 'source' | 'faithful_translation' | 'adaptation'; language: string;
  cefrLevel?: string | null; style?: 'narration' | 'dialogue'; derivedFrom?: string | null;
  coverage?: 'full' | 'condensed' | 'essentials';
  condensation?: { targetMinutes: number; sourceMinutes: number; excludeAds: boolean };
  segmentsFile: string; audio?: VariantAudio | null;
  generation?: Record<string, unknown>; evaluation?: Record<string, unknown>;
}
export interface Manifest {
  schemaVersion: 1;
  content: { id: string; title: string; originalLanguage: string; sourceType: 'podcast' | 'youtube' | 'reflection';
    sourceRef?: string | null; sourceUrl?: string | null; category?: string | null; editorial?: 'news' | 'discovery'; rights: 'personal_use' };
  variants: Variant[]; files: Record<string, ManifestFile>; removeVariants?: string[];
}
export interface Segment {
  id: string; text: string; fr?: string; speaker?: string;
  startMs: number | null; endMs: number | null; sourceSegments?: string[];
}
export interface Segments { schemaVersion: 1; variantKey: string; segments: Segment[]; keyVocab?: string[] }
export interface Publication {
  id: string; content_id: string; revision: string; seq: number; status: string;
  manifest_r2_key: string; queue_item_id: string | null; lease_token: string | null; commit_token: string | null;
}
export interface FileRow { path: string; sha256: string; size: number; content_type: string; r2_key: string; uploaded_at: string | null }
