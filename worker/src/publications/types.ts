export interface ManifestFile { sha256: string; size: number; contentType: string }
export interface VariantAudio {
  source: 'r2' | 'publisher_stream'; file?: string; url?: string;
  origin: 'original' | 'kokoro' | 'deepgram'; durationMs: number;
  timingSource: 'rss_srt' | 'rss_vtt' | 'macwhisper_srt' | 'kokoro' | 'deepgram' | 'none';
}
export interface Variant {
  quiz?: import('../quiz/validation').QuizQuestion[];
  key: string; kind: 'source' | 'faithful_translation' | 'adaptation'; language: string;
  cefrLevel?: string | null; style?: 'narration' | 'dialogue'; derivedFrom?: string | null;
  coverage?: 'full' | 'condensed' | 'essentials';
  condensation?: { targetMinutes: number; sourceMinutes: number; excludeAds: boolean };
  segmentsFile: string; audio?: VariantAudio | null;
  generation?: Record<string, unknown>; evaluation?: Record<string, unknown>;
}
export interface Manifest {
  schemaVersion: 1;
  content: { id: string; title: string; originalLanguage: string; sourceType: 'podcast' | 'youtube' | 'reflection' | 'dossier';
    sources?: {id:string;type:'episode'|'content'|'reflection'|'article';ref:string;title:string;capturedAt:string;sha256:string;publicationId?:string;variantKey?:string}[];
    sourceRef?: string | null; sourceUrl?: string | null; category?: string | null; editorial?: 'news' | 'discovery'; rights: 'personal_use' };
  variants: Variant[]; files: Record<string, ManifestFile>; removeVariants?: string[];
}
export interface Segment {
  id: string; text: string; fr?: string; speaker?: string;
  startMs: number | null; endMs: number | null; sourceSegments?: string[];
  provenance?: {sourceId:string;segmentId:string;startMs:number|null;endMs:number|null};
}
export interface GuideNote { segmentId: string; text: string; meaning?: string; note: string }
/** Positions en points de code Unicode, fin exclue. */
export interface GuideAnnotation extends GuideNote { meaning: string; startChar: number; endChar: number }
export interface Guide {
  /** Présent pour les guides annotant toute la transcription, même si aucune aide n’est nécessaire. */
  annotations?: GuideAnnotation[];
  level: 'A2' | 'B1' | 'B2' | 'C1'; voice: 'original' | 'synthetic';
  passage: { fromSegment: string; toSegment: string; reason?: string };
  expressions: GuideNote[]; listening: GuideNote[];
  /** Dictée phrase par phrase ; absente des guides publiés avant elle (on dicte alors segment par segment). */
  dictation?: DictationUnit[];
}
export interface DictationUnit { id: string; segmentId: string; text: string; startMs: number; endMs: number }
export interface Segments { schemaVersion: 1; variantKey: string; segments: Segment[]; keyVocab?: string[]; guide?: Guide }
export interface Publication {
  id: string; content_id: string; revision: string; seq: number; status: string;
  manifest_r2_key: string; queue_item_id: string | null; lease_token: string | null; commit_token: string | null;
}
export interface FileRow { path: string; sha256: string; size: number; content_type: string; r2_key: string; uploaded_at: string | null }
