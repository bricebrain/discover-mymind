import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { visible } from '../routes/contents';
import type { QuizQuestion } from './validation';

type Answer = { question_index: number; choice: number; correct: number; answered_at: string };
async function load(req: Request, env: Env, id: string, key: string, revision?: string) {
  const p = await visible(env,id,revision ?? new URL(req.url).searchParams.get('publication'));
  const v = await env.DB.prepare('SELECT quiz_json FROM variants WHERE publication_id=? AND variant_key=?')
    .bind(p.id,key).first<{ quiz_json: string | null }>();
  if (!v) throw new HttpError(404,'not_found','Version indisponible.');
  return { publicationId: p.id, questions: v.quiz_json ? JSON.parse(v.quiz_json) as QuizQuestion[] : [] };
}
async function answers(env: Env, publicationId: string, key: string) {
  return (await env.DB.prepare('SELECT question_index,choice,correct,answered_at FROM quiz_answers WHERE publication_id=? AND variant_key=? ORDER BY question_index')
    .bind(publicationId,key).all<Answer>()).results;
}
const score = (rows: Answer[], total: number) => ({ correct: rows.filter((a) => a.correct).length, answered: rows.length, total });
function correction(q: QuizQuestion, a: Answer) {
  return { questionIndex: a.question_index, choice: a.choice, correct: !!a.correct,
    correctChoice: q.correctChoice, explanation: q.explanation, answeredAt: a.answered_at };
}
export async function get(req: Request, env: Env, id: string, key: string) {
  const quiz = await load(req,env,id,key), rows = await answers(env,quiz.publicationId,key);
  return json({ publicationId: quiz.publicationId, variantKey: key,
    questions: quiz.questions.map((q,i) => {
      const answer = rows.find((a) => a.question_index === i);
      return { questionIndex: i, question: q.question, choices: q.choices, segmentIndex: q.segmentIndex,
        answer: answer ? correction(q,answer) : null };
    }), score: score(rows,quiz.questions.length) });
}
export async function submit(req: Request, env: Env, id: string, key: string) {
  const b = await readJson<{ publicationId?: unknown; questionIndex?: unknown; choice?: unknown } | null>(req,1024);
  if (!b || Array.isArray(b) || typeof b !== 'object' || typeof b.publicationId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(b.publicationId) || !Number.isInteger(b.questionIndex) || Number(b.questionIndex)<0 || Number(b.questionIndex)>2 ||
      !Number.isInteger(b.choice) || Number(b.choice)<0 || Number(b.choice)>2) {
    throw new HttpError(400,'invalid_answer','Publication, question et choix valides requis.');
  }
  const quiz = await load(req,env,id,key,b.publicationId), index = Number(b.questionIndex), choice = Number(b.choice);
  const question = quiz.questions[index];
  if (!question) throw new HttpError(404,'quiz_not_found','Question indisponible.');
  // Première réponse conservée : une relance réseau ne modifie ni la réponse ni le score.
  await env.DB.prepare(`INSERT OR IGNORE INTO quiz_answers
    (publication_id,variant_key,question_index,choice,correct,answered_at) VALUES (?,?,?,?,?,?)`)
    .bind(quiz.publicationId,key,index,choice,Number(choice === question.correctChoice),new Date().toISOString()).run();
  const rows = await answers(env,quiz.publicationId,key), answer = rows.find((a) => a.question_index === index)!;
  if (answer.choice !== choice) throw new HttpError(409,'already_answered','La première réponse est déjà enregistrée.');
  return json({ publicationId: quiz.publicationId, variantKey: key, answer: correction(question,answer), score: score(rows,quiz.questions.length) });
}
