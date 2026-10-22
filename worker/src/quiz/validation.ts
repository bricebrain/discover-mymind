export interface QuizQuestion {
  kind?: 'judgment'; question: string; choices: string[]; correctChoice: number;
  explanation: string; segmentIndex: number;
}
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && [...v].length <= max;
/** Le quiz entier est écarté si une question est invalide. Indices à partir de zéro. */
export function validQuiz(value: unknown, segmentCount = 100_000): value is QuizQuestion[] {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const fields = ['question', 'choices', 'correctChoice', 'explanation', 'segmentIndex'];
  return value.every((q: unknown) => {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return false;
    const x = q as Record<string, unknown>;
    return Object.keys(x).length === fields.length && fields.every((k) => Object.hasOwn(x,k)) &&
      text(x.question,500) && text(x.explanation,800) && Array.isArray(x.choices) && x.choices.length === 3 &&
      x.choices.every((v) => text(v,300)) && new Set(x.choices.map((v) => v.trim().toLowerCase())).size === 3 &&
      Number.isInteger(x.correctChoice) && Number(x.correctChoice) >= 0 && Number(x.correctChoice) < 3 &&
      Number.isInteger(x.segmentIndex) && Number(x.segmentIndex) >= 0 && Number(x.segmentIndex) < segmentCount;
  }) && new Set(value.map((q) => q.question.trim().toLowerCase())).size === 3;
}
