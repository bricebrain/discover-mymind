export const readingTime = (chars: number | null) => (chars ? `${Math.max(1, Math.round(chars / 1200))} min de lecture` : null);
