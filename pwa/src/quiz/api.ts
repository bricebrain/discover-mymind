import { api } from '../api/client';
export interface QuizAnswer { questionIndex: number; choice: number; correct: boolean; correctChoice: number; explanation: string }
export interface QuizQuestion { questionIndex: number; question: string; choices: string[]; segmentIndex: number; answer: QuizAnswer | null }
export interface QuizScore { correct: number; answered: number; total: number }
export interface Quiz { publicationId: string; variantKey: string; questions: QuizQuestion[]; score: QuizScore }
export interface QuizTarget { contentId: string; variantKey: string; publicationId: string }
export const quizKey = (t: QuizTarget) => ['quiz', t.contentId, t.variantKey, t.publicationId] as const;
const path = (t: QuizTarget) => `/api/contents/${encodeURIComponent(t.contentId)}/variants/${encodeURIComponent(t.variantKey)}/quiz`;
export const getQuiz = (t: QuizTarget) => api<Quiz>(`${path(t)}?publication=${encodeURIComponent(t.publicationId)}`);
export const answerQuiz = (t: QuizTarget, questionIndex: number, choice: number) =>
  api<{ answer: QuizAnswer; score: QuizScore }>(`${path(t)}/answers`, { method: 'POST', body: { publicationId: t.publicationId, questionIndex, choice } });
