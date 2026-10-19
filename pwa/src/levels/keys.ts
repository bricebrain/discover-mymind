export const levelSuggestionKey = (showId: string) => ['level-suggestion', showId] as const;
export const levelFeedbackKey = (contentId: string, variantKey: string) => ['level-feedback', contentId, variantKey] as const;
