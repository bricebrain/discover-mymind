import { describe, expect, it } from 'vitest';
import { cleanPastedArticle, worthCleaning } from './cleanPaste';

const article = `Accepter et fermer
Nous utilisons des cookies pour améliorer votre expérience.
La dette publique atteint un record

Temps de lecture : 4 min
Partager
Facebook
Selon l'Insee, la dette publique a atteint 112 % du PIB au deuxième
trimestre, un niveau inédit.
Photo : AFP
À lire aussi : Budget 2027, les pistes du gouvernement
Le gouvernement promet des économies.



Abonnez-vous à notre newsletter`;

describe('nettoyage au collage', () => {
  it('retire les lignes parasites et recolle les phrases coupées', () => {
    const r = cleanPastedArticle(article);
    expect(r.text).toBe("La dette publique atteint un record\n\nSelon l'Insee, la dette publique a atteint 112 % du PIB au deuxième trimestre, un niveau inédit.\nLe gouvernement promet des économies.");
    expect(r.removedLines).toBe(8);
    expect(r.joinedLines).toBe(1);
    expect(worthCleaning(article, r)).toBe(true);
  });
  it('ne touche pas un texte propre, ni une phrase longue qui contient un mot-clé', () => {
    const clean = 'The Guardian reports that cookies are a privacy issue debated in Brussels, with new rules expected next year for every website operating in the European Union and beyond, according to officials.';
    const r = cleanPastedArticle(clean);
    expect(r.text).toBe(clean);
    expect(worthCleaning(clean, r)).toBe(false);
  });
  it('garde les paragraphes séparés et les titres', () => {
    const r = cleanPastedArticle('Titre\n\nPremier paragraphe complet.\n\nSecond paragraphe complet.');
    expect(r.text).toBe('Titre\n\nPremier paragraphe complet.\n\nSecond paragraphe complet.');
  });
});
