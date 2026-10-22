/** Quiz d'une publication précise ; onSeek reçoit l'index du passage adapté. */
import { motion } from 'motion/react';
import { Button } from '../components/ui/button';
import { Notice, Spinner, cardCls } from '../components/ui/kit';
import { useOnline } from '../offline/OfflineBanner';
import type { QuizTarget } from './api';
import { useQuiz } from './useQuiz';
export function QuizCard({ onSeek, ...target }: QuizTarget & { onSeek?: (segmentIndex: number) => void }) {
  const quiz = useQuiz(target);
  const online = useOnline();
  if (quiz.isPending) return online ? <Spinner label="Chargement du quiz" /> : <Notice>Quiz indisponible hors ligne.</Notice>;
  if (quiz.isError) return <Notice tone="error" action={<Button variant="ghost" onClick={() => void quiz.refetch()}>Réessayer</Button>}>{quiz.error.message}</Notice>;
  if (!quiz.data.questions.length) return null;
  return <section className={`${cardCls} space-y-5 p-4`} aria-label="Quiz de compréhension">
    <h2 className="m-0 font-display text-2xl font-normal">{quiz.data.questions[0]?.kind === 'judgment' ? 'Qu’aurais-tu décidé ?' : 'Compréhension'} · {quiz.data.score.correct}/{quiz.data.score.total}</h2>
    {!online && <Notice>Hors ligne : les réponses attendront une connexion.</Notice>}
    {quiz.data.questions.map((q) => <fieldset key={q.questionIndex} className="m-0 min-w-0 space-y-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold">{q.questionIndex + 1}. {q.question}</legend>
      {q.choices.map((choice, index) => <Button key={index} variant="outline" className={`h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left ${q.answer ? "disabled:opacity-100" : ""} ${q.answer?.correctChoice === index ? "border-primary/30 bg-primary-soft text-primary" : ""}`}
        disabled={!!q.answer || quiz.answer.isPending || !online} aria-pressed={q.answer?.choice === index}
        onClick={() => void quiz.submit(q.questionIndex, index)}>
        {q.answer?.correctChoice === index ? '✓ ' : q.answer?.choice === index ? '✗ ' : ''}{choice}
      </Button>)}
      {q.answer && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status" className="space-y-2 text-sm">
        <p>{q.answer.correct ? 'Bonne réponse.' : `Bonne réponse : ${q.choices[q.answer.correctChoice]}`}</p>
        <p>{q.kind === 'judgment' && <strong>Le véritable verdict : </strong>}{q.answer.explanation}</p>
        {onSeek && <Button variant="ghost" onClick={() => onSeek(q.segmentIndex)}>Réécouter ce passage</Button>}
      </motion.div>}
    </fieldset>)}
    {quiz.answer.isError && <Notice tone="error">{quiz.answer.error.message}</Notice>}
  </section>;
}
