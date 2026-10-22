import { scheduleReview, UNDERSTOOD } from '../listening-reviews/routes';
import type { Env } from '../env';
import { HttpError, json, readJson } from '../http';
import { gemini } from '../cloud/gemini';
import { visible } from '../routes/contents';
import type { Segments } from '../publications/types';
import { align, mistakes, score, words, type Mistake } from './align';

/** Catégories d'erreur d'écoute, de la plus « oreille » à la plus « orthographe ». */
export const CATEGORIES = ['reduced_form', 'linking', 'unknown_word', 'number', 'proper_noun', 'grammar_word', 'spelling', 'missed'] as const;
export type Category = typeof CATEGORIES[number];
export interface AnalysedMistake extends Mistake { category: Category; explanation: string | null }

const INSTRUCTION = `Tu aides un francophone qui apprend à comprendre l'anglais parlé. Il a écouté une phrase anglaise et tapé ce qu'il a entendu.
Pour CHAQUE erreur (index donné), choisis une catégorie et explique en français, en une ou deux phrases courtes, pourquoi elle est difficile à l'oreille :
reduced_form (forme réduite : to, of, and, can, have, contractions), linking (mots enchaînés qui semblent n'en faire qu'un),
unknown_word (mot ou expression sans doute inconnu ; donne son sens), number (nombre, date, quantité), proper_noun (nom propre),
grammar_word (petit mot grammatical : article, préposition, terminaison -s/-ed), spelling (bien entendu mais mal écrit),
missed (passage décroché : trop rapide ou trop long).
Adapte le vocabulaire de l'explication au niveau CECRL donné. Si la voix est "synthetic" (voix de synthèse), ne commente jamais la prononciation réelle d'un locuteur.
Ajoute "tip" : un conseil d'écoute en français pour la prochaine fois (une phrase). Réponds en JSON :
{"errors":[{"index":0,"category":"reduced_form","explanation":"..."}],"tip":"..."}`;

/** Catégorie déduite sans IA quand l'analyse est indisponible. */
export function fallbackCategory(m: Mistake): Category {
  if (!m.heard) return 'missed';
  if (/^\d+$/.test(m.expected.split(' ')[0]!)) return 'number';
  const a = m.expected.replace(/\s/g, ''), b = m.heard.replace(/\s/g, '');
  if (a === b) return 'linking';
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
  return same >= Math.max(a.length, b.length) * 0.6 ? 'spelling' : 'unknown_word';
}

async function analyse(env: Env, sentence: string, typed: string, errors: Mistake[], voice: string, level: string) {
  if (!env.GEMINI_API_KEY || !errors.length) return null;
  try {
    const raw = await gemini(env, INSTRUCTION, { sentence, typed, voice, level, errors: errors.map((e, index) => ({ index, ...e })) });
    const data = JSON.parse(new TextDecoder().decode(raw)) as { errors?: { index?: unknown; category?: unknown; explanation?: unknown }[]; tip?: unknown };
    const byIndex = new Map<number, { category: Category; explanation: string }>();
    for (const e of data.errors ?? []) {
      if (Number.isInteger(e.index) && CATEGORIES.includes(e.category as Category) && typeof e.explanation === 'string' && e.explanation.trim())
        byIndex.set(e.index as number, { category: e.category as Category, explanation: e.explanation.trim().slice(0, 600) });
    }
    return { byIndex, tip: typeof data.tip === 'string' && data.tip.trim() ? data.tip.trim().slice(0, 400) : null };
  } catch (error) {
    // L'analyse est un plus : la correction mot à mot reste disponible. La cause reste visible dans les journaux du Worker.
    console.warn('Analyse de dictée indisponible :', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function segmentsOf(env: Env, publicationId: string, key: string) {
  const v = await env.DB.prepare(`SELECT v.language, v.audio_origin, f.r2_key FROM variants v
    JOIN publication_files f ON f.publication_id=v.publication_id AND f.path=v.segments_path
    WHERE v.publication_id=? AND v.variant_key=?`).bind(publicationId, key)
    .first<{ language: string; audio_origin: string | null; r2_key: string }>();
  if (!v) throw new HttpError(404, 'not_found', 'Version indisponible.');
  const object = await env.FILES.get(v.r2_key);
  if (!object) throw new HttpError(404, 'not_found', 'Transcription indisponible.');
  return { variant: v, doc: await object.json<Segments>() };
}

export async function submit(req: Request, env: Env, id: string, key: string) {
  const b = await readJson<{ publicationId?: unknown; segmentId?: unknown; unitId?: unknown; typed?: unknown } | null>(req, 4096);
  if (!b || typeof b !== 'object' || typeof b.publicationId !== 'string' || !/^[0-9a-f-]{36}$/.test(b.publicationId)
      || (('segmentId' in b) === ('unitId' in b))
      || typeof (b.unitId ?? b.segmentId) !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test((b.unitId ?? b.segmentId) as string)
      || typeof b.typed !== 'string' || b.typed.length > 1000) {
    throw new HttpError(400, 'invalid_dictation', 'Publication, phrase et texte entendu (1 000 caractères au plus) requis.');
  }
  const p = await visible(env, id, b.publicationId);
  const { variant, doc } = await segmentsOf(env, p.id, key);
  const segment = b.unitId !== undefined
    ? doc.guide?.dictation?.find((unit) => unit.id === b.unitId)
    : doc.segments.find((s) => s.id === b.segmentId);
  if (!segment || variant.language.split('-')[0] !== 'en') throw new HttpError(404, 'not_found', 'Phrase anglaise indisponible.');
  const voice = doc.guide?.voice ?? (variant.audio_origin === 'original' ? 'original' : 'synthetic');
  const level = doc.guide?.level ?? 'B1';
  const tokens = align(words(segment.text), words(b.typed)), counts = score(tokens), found = mistakes(tokens);
  const analysis = await analyse(env, segment.text, b.typed, found, voice, level);
  const errors: AnalysedMistake[] = found.map((m, index) => ({ ...m,
    category: analysis?.byIndex.get(index)?.category ?? fallbackCategory(m), explanation: analysis?.byIndex.get(index)?.explanation ?? null }));
  const attempt = { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await env.DB.batch([env.DB.prepare(`INSERT INTO dictation_attempts (id,content_id,publication_id,variant_key,segment_id,voice,expected,typed,
    expected_words,correct_words,errors_json,tip,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(attempt.id, id, p.id, key, segment.id, voice, segment.text, b.typed, counts.expectedWords, counts.correctWords,
      JSON.stringify(errors), analysis?.tip ?? null, attempt.createdAt),
    scheduleReview(env, id, p.id, key, attempt.createdAt)]);
  return json({ ...attempt, segmentId: b.unitId !== undefined ? (segment as { segmentId: string }).segmentId : segment.id,
    ...(b.unitId !== undefined ? { unitId: segment.id } : {}), expected: segment.text, tokens, ...counts,
    accuracy: counts.expectedWords ? counts.correctWords / counts.expectedWords : 1, errors, tip: analysis?.tip ?? null });
}

/** Une phrase est « comprise à l'oreille » quand au moins 90 % de ses mots ont été reconnus. */
export { UNDERSTOOD } from '../listening-reviews/routes';

export async function progress(env: Env) {
  const since = new Date(Date.now() - 56 * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(`SELECT a.created_at, a.expected_words, a.correct_words, a.errors_json, a.content_id,
      a.expected, a.typed, c.title FROM dictation_attempts a LEFT JOIN contents c ON c.id=a.content_id
    WHERE a.created_at>=? ORDER BY a.created_at DESC LIMIT 2000`).bind(since)
    .all<{ created_at: string; expected_words: number; correct_words: number; errors_json: string; content_id: string; expected: string; typed: string; title: string | null }>();
  const weeks = new Map<string, { sentences: number; understood: number; words: number; correct: number }>();
  const categories = new Map<Category, number>();
  const monthAgo = Date.now() - 30 * 86_400_000;
  for (const r of results) {
    const day = new Date(r.created_at), monday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - (day.getUTCDay() + 6) % 7));
    const week = monday.toISOString().slice(0, 10), w = weeks.get(week) ?? { sentences: 0, understood: 0, words: 0, correct: 0 };
    w.sentences++; w.words += r.expected_words; w.correct += r.correct_words;
    if (!r.expected_words || r.correct_words / r.expected_words >= UNDERSTOOD) w.understood++;
    weeks.set(week, w);
    if (Date.parse(r.created_at) >= monthAgo) for (const e of JSON.parse(r.errors_json) as AnalysedMistake[]) categories.set(e.category, (categories.get(e.category) ?? 0) + 1);
  }
  return json({
    understoodThreshold: UNDERSTOOD,
    weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, w]) => ({ week, ...w,
      understoodShare: w.sentences ? w.understood / w.sentences : 0, wordAccuracy: w.words ? w.correct / w.words : 0 })),
    categories: [...categories].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
    recent: results.slice(0, 10).map((r) => ({ createdAt: r.created_at, contentId: r.content_id, title: r.title, expected: r.expected,
      typed: r.typed, accuracy: r.expected_words ? r.correct_words / r.expected_words : 1 })),
  }, 200, { 'Cache-Control': 'no-store' });
}
