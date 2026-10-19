export function validWordPick(word: string, sentence: string) {
  const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const value = normalize(word);
  return value.length > 0 && word.trim().length <= 120 && value.split(' ').length <= 8
    && sentence.trim().length > 0 && sentence.length <= 4000 && normalize(sentence).includes(value);
}
export const PICK_STATUS = { pending: 'En attente', sent: 'Envoyé à EnglishFluency', already_known: 'Déjà connu', failed: 'Échec' } as const;
