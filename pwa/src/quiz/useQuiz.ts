import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { answerQuiz, getQuiz, quizKey, type Quiz, type QuizTarget } from './api';
export function useQuiz(target: QuizTarget) {
  const qc = useQueryClient();
  const lock = useRef(false);
  const query = useQuery({ queryKey: quizKey(target), queryFn: () => getQuiz(target) });
  const answer = useMutation({
    retry: false,
    mutationFn: ({ questionIndex, choice }: { questionIndex: number; choice: number }) => answerQuiz(target, questionIndex, choice),
    onMutate: () => target,
    onSuccess: (result, input, submittedTarget) => qc.setQueryData<Quiz>(quizKey(submittedTarget), (previous) => previous && ({ ...previous,
      score: result.score, questions: previous.questions.map((q) => q.questionIndex === input.questionIndex ? { ...q, answer: result.answer } : q),
    })),
    onError: (_error, _input, submittedTarget) => { void qc.invalidateQueries({ queryKey: quizKey(submittedTarget ?? target) }); },
  });
  async function submit(questionIndex: number, choice: number) {
    if (lock.current || qc.getQueryData<Quiz>(quizKey(target))?.questions.find((q) => q.questionIndex === questionIndex)?.answer) return;
    lock.current = true;
    try { await answer.mutateAsync({ questionIndex, choice }); } catch { /* Erreur exposée par la mutation. */ }
    finally { lock.current = false; }
  }
  return { ...query, answer, submit };
}
