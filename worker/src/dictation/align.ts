/**
 * Comparaison mot à mot d'une dictée avec la phrase de référence.
 * Hésitations ignorées, casse et ponctuation sans importance, nombres en chiffres ou en lettres équivalents.
 */
const FILLERS = new Set(['uh', 'um', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm']);
const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

export type TokenStatus = 'ok' | 'missing' | 'wrong' | 'extra';
export interface Token { expected?: string; typed?: string; status: TokenStatus }
export interface Mistake { expected: string; heard: string }

/** Mots normalisés : minuscules, apostrophes droites, « sixty-five » → « 65 », « % » → « percent », sans hésitations. */
export function words(text: string): string[] {
  const raw = text.toLowerCase().replace(/[’‘`]/g, "'").replace(/%/g, ' percent ').replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/).flatMap((w) => w.split('-')).map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w && !FILLERS.has(w));
  const result: string[] = [];
  for (let k = 0; k < raw.length; k++) {
    const w = raw[k]!, tens = TENS[w], unit = UNITS.indexOf(w);
    if (tens !== undefined) {
      // « sixty-five » ou « sixty five » : un seul nombre, comme « 65 ».
      const next = UNITS.indexOf(raw[k + 1] ?? '');
      if (next > 0 && next < 10) { result.push(String(tens + next)); k++; } else result.push(String(tens));
    } else result.push(unit >= 0 ? String(unit) : w);
  }
  return result;
}

/** Alignement de distance d'édition : chaque mot de référence est retrouvé, manqué ou mal entendu. */
export function align(expected: string[], typed: string[]): Token[] {
  const n = expected.length, m = typed.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (expected[i - 1] === typed[j - 1] ? 0 : 1));
  }
  const tokens: Token[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (expected[i - 1] === typed[j - 1] ? 0 : 1)) {
      tokens.push({ expected: expected[i - 1], typed: typed[j - 1], status: expected[i - 1] === typed[j - 1] ? 'ok' : 'wrong' });
      i--; j--;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) { tokens.push({ expected: expected[i - 1], status: 'missing' }); i--; }
    else { tokens.push({ typed: typed[j - 1], status: 'extra' }); j--; }
  }
  return tokens.reverse();
}

export function score(tokens: Token[]) {
  const expectedWords = tokens.filter((t) => t.expected !== undefined).length;
  return { expectedWords, correctWords: tokens.filter((t) => t.status === 'ok').length };
}

/** Erreurs regroupées : une suite de mots manqués ou mal entendus forme une seule erreur à expliquer. */
export function mistakes(tokens: Token[]): Mistake[] {
  const result: Mistake[] = [];
  let current: { expected: string[]; heard: string[] } | null = null;
  for (const t of tokens) {
    if (t.status === 'ok') {
      if (current) result.push({ expected: current.expected.join(' '), heard: current.heard.join(' ') });
      current = null;
      continue;
    }
    current ??= { expected: [], heard: [] };
    if (t.expected !== undefined) current.expected.push(t.expected);
    if (t.typed !== undefined) current.heard.push(t.typed);
  }
  if (current) result.push({ expected: current.expected.join(' '), heard: current.heard.join(' ') });
  return result.filter((e) => e.expected);
}
