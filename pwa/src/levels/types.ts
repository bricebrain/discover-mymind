import type { AutoLevel } from '../api/shows';

export type LevelRating = 'too_easy' | 'just_right' | 'too_hard';
export type LevelSuggestionReason = 'insufficient_feedback' | 'different_levels' | 'no_streak'
  | 'level_bound' | 'two_too_easy' | 'two_too_hard';

export interface LevelSuggestion {
  showId: string;
  currentLevel: AutoLevel;
  suggestedLevel: AutoLevel;
  changed: boolean;
  reason: LevelSuggestionReason;
  message: string;
}

export interface LevelFeedback {
  contentId: string;
  variantKey: string;
  showId: string;
  publicationId: string;
  level: AutoLevel;
  rating: LevelRating;
}

export interface LevelFeedbackInput {
  publicationId: string;
  rating: LevelRating | null;
}

export interface LevelFeedbackResponse {
  feedback: LevelFeedback | null;
  levelSuggestion: LevelSuggestion;
}
